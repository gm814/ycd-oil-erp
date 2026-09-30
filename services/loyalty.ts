import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { assertPermission, PERMISSIONS as P } from "@/lib/rbac";

export async function loyaltyBalance(tx: Prisma.TransactionClient, branchId: string, customerId: string) {
  const sum = await tx.loyaltyEntry.aggregate({ where: { branchId, customerId, revoked: false }, _sum: { points: true } });
  return sum._sum.points ?? 0;
}
// Called inside the same transaction as completion/collection. One stamp per paid visit.
export async function earnLoyalty(tx: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { returns: true, serviceOrder: { include: { items: true, loyaltyRedemption: true } } } });
  const order = invoice.serviceOrder;
  if (invoice.status !== "PAID" || invoice.total.lte(0) || invoice.returns.some(r => r.status === "COMPLETED") || order.channel !== "WASH" || order.status !== "COMPLETED" || order.loyaltyRedemption) return;
  const program = await tx.loyaltyProgram.findUnique({ where: { branchId: order.branchId } });
  if (!program?.active || !order.items.some(i => i.productId === program.earningProductId && i.quantity.gte(1) && i.unitPrice.mul(i.quantity).minus(i.discount).gt(0))) return;
  await tx.loyaltyEntry.upsert({ where: { invoiceId }, update: {}, create: { branchId: order.branchId, customerId: order.customerId, invoiceId, points: 1 } });
}
export async function redeemLoyaltyInTransaction(tx: Prisma.TransactionClient, session: SessionPayload, orderId: string) {
  assertPermission(session.permissions, P.SERVICE_ORDER_CREATE);
  if (!session.branchId) throw new Error("FORBIDDEN");
  const order = await tx.serviceOrder.findUnique({ where: { id: orderId }, include: { items: true, loyaltyRedemption: true } });
  if (!order || order.branchId !== session.branchId || order.channel !== "WASH") throw new Error("ORDER_NOT_FOUND");
  if (order.loyaltyRedemption) return order.loyaltyRedemption;
  if (["COMPLETED", "CANCELLED"].includes(order.status) || order.items.length) throw new Error("EMPTY_OPEN_ORDER_REQUIRED");
  const program = await tx.loyaltyProgram.findUnique({ where: { branchId: session.branchId }, include: { rewardProduct: true } });
  if (!program?.active || !program.rewardProduct.active || program.rewardProduct.category !== "SERVICE") throw new Error("PROGRAM_UNAVAILABLE");
  if (await loyaltyBalance(tx, session.branchId, order.customerId) < program.paidWashesRequired) throw new Error("LOYALTY_BALANCE_LOW");
  await tx.serviceOrderItem.create({ data: { serviceOrderId: order.id, productId: program.rewardProductId, descriptionAr: `غسلة مجانية — برنامج الولاء: ${program.rewardProduct.nameAr}`, quantity: 1, unitPrice: program.rewardProduct.salePrice, discount: program.rewardProduct.salePrice } });
  const entry = await tx.loyaltyEntry.create({ data: { branchId: session.branchId, customerId: order.customerId, orderId: order.id, points: -program.paidWashesRequired } });
  await tx.auditLog.create({ data: { actorId: session.userId, action: "LOYALTY_REDEEMED", entityType: "ServiceOrder", entityId: order.id, afterJson: { points: entry.points, rewardProductId: program.rewardProductId } } });
  return entry;
}
export async function redeemLoyalty(session: SessionPayload, orderId: string) {
  return db.$transaction(tx => redeemLoyaltyInTransaction(tx, session, orderId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
