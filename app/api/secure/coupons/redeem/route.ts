import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ serial: z.string().trim().min(6).max(80) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.COUPON_REDEEM)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const found = await tx.coupon.findUnique({ where: { serial: parsed.data.serial.toUpperCase() } });
      if (!found) throw new Error("COUPON_NOT_FOUND");
      if (found.status !== "ACTIVE") throw new Error("COUPON_NOT_ACTIVE");
      if (found.expiresAt && found.expiresAt < new Date()) {
        const expired = await tx.coupon.update({ where: { id: found.id }, data: { status: "EXPIRED" } });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "WASH_COUPON_EXPIRED",
            entityType: "Coupon",
            entityId: expired.id,
            afterJson: { serial: expired.serial, expiresAt: expired.expiresAt?.toISOString() ?? null },
          },
        });
        return { coupon: expired, error: "COUPON_EXPIRED" as const };
      }

      const updated = await tx.coupon.update({
        where: { id: found.id },
        data: {
          status: "USED",
          usedAt: new Date(),
          redeemedBranchId: session.branchId!,
          redeemedBy: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "WASH_COUPON_REDEEMED",
          entityType: "Coupon",
          entityId: updated.id,
          afterJson: { serial: updated.serial, branchId: session.branchId },
        },
      });
      return { coupon: updated, error: null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ coupon: result.coupon });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COUPON_REDEEM_FAILED";
    return NextResponse.json({ error: code }, { status: code === "COUPON_NOT_FOUND" ? 404 : 409 });
  }
}
