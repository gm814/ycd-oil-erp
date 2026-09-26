import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  countedCash: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.SHIFT_CLOSE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const shift = await db.$transaction(async (tx) => {
      const open = await tx.shift.findFirst({
        where: { branchId: session.branchId!, closedAt: null },
        orderBy: { openedAt: "desc" },
      });
      if (!open) throw new Error("NO_OPEN_SHIFT");

      const cashPayments = await tx.payment.findMany({
        where: {
          method: "CASH",
          shiftId: open.id,
        },
        select: { amount: true },
      });

      const cashSales = cashPayments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      const expectedCash = open.openingCash.plus(cashSales);
      const countedCash = new Prisma.Decimal(parsed.data.countedCash);
      const cashVariance = countedCash.minus(expectedCash);

      const closed = await tx.shift.update({
        where: { id: open.id },
        data: {
          closedAt: new Date(),
          closedBy: session.userId,
          expectedCash,
          countedCash,
          cashVariance,
          notes: parsed.data.notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SHIFT_CLOSED",
          entityType: "Shift",
          entityId: closed.id,
          afterJson: {
            expectedCash: expectedCash.toString(),
            countedCash: countedCash.toString(),
            cashVariance: cashVariance.toString(),
          },
        },
      });

      return closed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ shift });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SHIFT_CLOSE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "NO_OPEN_SHIFT" ? 409 : 400 });
  }
}
