import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS as P, hasPermission } from "@/lib/rbac";
import { redeemLoyalty } from "@/services/loyalty";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("redeem"), orderId: z.string().min(1) }),
  z.object({ action: z.literal("configure"), paidWashesRequired: z.coerce.number().int().min(1).max(100), earningProductId: z.string().min(1), rewardProductId: z.string().min(1), active: z.enum(["true", "false"]) }),
]);
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.branchId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const data = parsed.data;
    if (data.action === "redeem") return NextResponse.json({ entry: await redeemLoyalty(session, data.orderId) });
    if (!hasPermission(session.permissions, P.USER_MANAGE)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    await db.$transaction(async tx => {
      const products = await tx.product.findMany({ where: { id: { in: [data.earningProductId, data.rewardProductId] }, active: true, category: "SERVICE", salePrice: { gt: 0 } } });
      if (![data.earningProductId, data.rewardProductId].every(id => products.some(p => p.id === id))) throw new Error("SERVICE_PRODUCT_REQUIRED");
      const { action: _, active, ...fields } = data;
      const before = await tx.loyaltyProgram.findUnique({ where: { branchId: session.branchId! } });
      const program = await tx.loyaltyProgram.upsert({ where: { branchId: session.branchId! }, create: { branchId: session.branchId!, ...fields, active: active === "true" }, update: { ...fields, active: active === "true" } });
      await tx.auditLog.create({ data: { actorId: session.userId, action: "LOYALTY_CONFIGURED", entityType: "LoyaltyProgram", entityId: program.id, beforeJson: before ? { paidWashesRequired: before.paidWashesRequired, active: before.active, earningProductId: before.earningProductId, rewardProductId: before.rewardProductId } : undefined, afterJson: { ...fields, active: program.active } } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && !e.message.includes("\n") ? e.message : "CONCURRENT_CHANGE" }, { status: 409 }); }
}
