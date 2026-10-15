import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { washEligibility } from "@/lib/wash-eligibility";
import { nextDocumentNumber } from "@/lib/document-number";
import { companyConfig } from "@/lib/config";

type Actor = { userId: string; branchId?: string | null; permissions: readonly string[] };
export async function prepareCustomerPackage(actor: Actor, invoiceId: string, waiveFilter: boolean, reason: string) {
  if (!actor.branchId || !hasPermission(actor.permissions, PERMISSIONS.INVOICE_ISSUE)) throw new Error("FORBIDDEN");
  if (waiveFilter && (!hasPermission(actor.permissions, PERMISSIONS.SERVICE_ORDER_APPROVE) || reason.trim().length < 5)) throw new Error("OVERRIDE_FORBIDDEN");
  return db.$transaction(tx => prepareCustomerPackageInTransaction(tx, actor, invoiceId, waiveFilter, reason), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
async function prepareCustomerPackageInTransaction(tx: Prisma.TransactionClient, actor: Actor, invoiceId: string, waiveFilter: boolean, reason: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, serviceOrder: { branchId: actor.branchId! } }, include: {
    customer: true, coupons: true, returns: { where: { status: "COMPLETED" } },
    serviceOrder: { include: { items: { include: { product: true } } } },
  } });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (invoice.documentType !== "INVOICE" || invoice.status === "VOID" || invoice.serviceOrder.status !== "COMPLETED") throw new Error("INVOICE_NOT_ELIGIBLE");
  const eligibility = washEligibility(invoice.serviceOrder);
  if (waiveFilter && !eligibility.hasOil) throw new Error("OIL_REQUIRED");
  // Any historical coupon (including used/cancelled) prevents a second reward.
  let coupon = invoice.coupons[0];
  const canIssue = invoice.returns.length === 0 && (eligibility.eligible || (waiveFilter && eligibility.hasOil));
  if (waiveFilter && invoice.returns.length) throw new Error("RETURN_REVIEW_REQUIRED");
  if (!coupon && canIssue) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + companyConfig.washCouponValidityDays);
    coupon = await tx.coupon.create({ data: { invoiceId: invoice.id, serial: await nextDocumentNumber(tx), expiresAt } });
    await tx.auditLog.create({ data: { actorId: actor.userId, action: "OIL_SERVICE_WASH_COUPON_ISSUED", entityType: "Coupon", entityId: coupon.id,
      afterJson: { invoiceId, serviceOrderId: invoice.serviceOrderId, serial: coupon.serial, oilRequired: true, filterWaived: !eligibility.hasOilFilter, reason: !eligibility.hasOilFilter ? reason.trim() : null } } });
  }
  const couponState = coupon ? coupon.status === "ACTIVE" && (!coupon.expiresAt || coupon.expiresAt > new Date()) ? "ACTIVE" : "UNAVAILABLE" : invoice.returns.length ? "RETURN_REVIEW" : eligibility.hasOil ? "FILTER_REQUIRED" : "OIL_REQUIRED";
  return { couponState, phone: invoice.customer.phone, customerName: invoice.customer.name, invoiceNo: invoice.invoiceNo };
}
