import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ openingCash: z.coerce.number().min(0).max(10_000_000).default(0) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.SHIFT_OPEN)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const shift = await db.$transaction(async (tx) => {
      const open = await tx.shift.findFirst({ where: { branchId: session.branchId!, closedAt: null } });
      if (open) throw new Error("SHIFT_ALREADY_OPEN");

      const created = await tx.shift.create({
        data: {
          branchId: session.branchId!,
          openedBy: session.userId,
          openingCash: parsed.data.openingCash,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SHIFT_OPENED",
          entityType: "Shift",
          entityId: created.id,
          afterJson: { openingCash: String(parsed.data.openingCash) },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SHIFT_OPEN_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SHIFT_ALREADY_OPEN" ? 409 : 400 });
  }
}
