import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  countedCash: z.coerce.number().min(0).max(10_000_000),
  countedCard: z.coerce.number().min(-10_000_000).max(10_000_000),
  countedTransfer: z.coerce.number().min(-10_000_000).max(10_000_000),
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

      const [payments, refunds] = await Promise.all([
        tx.payment.findMany({
          where: {
            shiftId: open.id,
            method: { in: ["CASH", "CARD", "TRANSFER"] },
          },
          select: { method: true, amount: true },
        }),
        tx.salesReturn.findMany({
          where: {
            branchId: session.branchId!,
            status: "COMPLETED",
            createdAt: { gte: open.openedAt },
            refundMethod: { in: ["CASH", "CARD", "TRANSFER"] },
            refundAmount: { gt: 0 },
          },
          select: { refundMethod: true, refundAmount: true },
        }),
      ]);

      const receiptTotal = (method: "CASH" | "CARD" | "TRANSFER") =>
        payments
          .filter((payment) => payment.method === method)
          .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));

      const refundTotal = (method: "CASH" | "CARD" | "TRANSFER") =>
        refunds
          .filter((refund) => refund.refundMethod === method)
          .reduce((sum, refund) => sum.plus(refund.refundAmount), new Prisma.Decimal(0));

      const expectedCash = open.openingCash.plus(receiptTotal("CASH")).minus(refundTotal("CASH"));
      const expectedCard = receiptTotal("CARD").minus(refundTotal("CARD"));
      const expectedTransfer = receiptTotal("TRANSFER").minus(refundTotal("TRANSFER"));

      const countedCash = new Prisma.Decimal(parsed.data.countedCash);
      const countedCard = new Prisma.Decimal(parsed.data.countedCard);
      const countedTransfer = new Prisma.Decimal(parsed.data.countedTransfer);

      const cashVariance = countedCash.minus(expectedCash);
      const cardVariance = countedCard.minus(expectedCard);
      const transferVariance = countedTransfer.minus(expectedTransfer);

      const closed = await tx.shift.update({
        where: { id: open.id },
        data: {
          closedAt: new Date(),
          closedBy: session.userId,
          expectedCash,
          countedCash,
          cashVariance,
          expectedCard,
          countedCard,
          cardVariance,
          expectedTransfer,
          countedTransfer,
          transferVariance,
          notes: parsed.data.notes || null,
        },
      });

      const hasVariance =
        cashVariance.abs().greaterThan("0.01") ||
        cardVariance.abs().greaterThan("0.01") ||
        transferVariance.abs().greaterThan("0.01");

      if (hasVariance) {
        const variance = await tx.shiftVarianceResolution.create({
          data: {
            shiftId: closed.id,
            branchId: session.branchId!,
            cashVariance,
            cardVariance,
            transferVariance,
            reason: parsed.data.notes || null,
            requestedBy: session.userId,
          },
        });

        await tx.approval.create({
          data: {
            entityType: "ShiftVarianceResolution",
            entityId: variance.id,
            step: "SHIFT_VARIANCE_APPROVAL",
            requestedBy: session.userId,
            status: "PENDING",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "SHIFT_VARIANCE_REQUESTED",
            entityType: "ShiftVarianceResolution",
            entityId: variance.id,
            afterJson: {
              shiftId: closed.id,
              cashVariance: cashVariance.toString(),
              cardVariance: cardVariance.toString(),
              transferVariance: transferVariance.toString(),
            },
          },
        });
      }

      const hasVariance =
        cashVariance.abs().greaterThan("0.01") ||
        cardVariance.abs().greaterThan("0.01") ||
        transferVariance.abs().greaterThan("0.01");

      if (hasVariance) {
        await tx.shiftVarianceResolution.create({
          data: {
            shiftId: closed.id,
            branchId: session.branchId!,
            cashVariance,
            cardVariance,
            transferVariance,
            reason: parsed.data.notes || "فرق ناتج عن مطابقة قنوات التحصيل عند إقفال الوردية.",
            requestedBy: session.userId,
          },
        });
      }

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
            expectedCard: expectedCard.toString(),
            countedCard: countedCard.toString(),
            cardVariance: cardVariance.toString(),
            expectedTransfer: expectedTransfer.toString(),
            countedTransfer: countedTransfer.toString(),
            transferVariance: transferVariance.toString(),
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
