import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SessionPayload } from "@/lib/auth";
import { PERMISSIONS as P, hasPermission } from "@/lib/rbac";
import { riyadhDateRange, riyadhDateKey } from "@/lib/time";

export type WashAction =
  | { action: "configure"; washBranchId: string; nameAr: string; unitAmount?: string; cadence: string; issueMode?: "ELIGIBLE" | "ALL" }
  | { action: "redeem"; serial: string }
  | { action: "complete"; serviceId: string }
  | { action: "value"; serviceId: string; amount: string }
  | { action: "submit"; agreementId: string; businessDate: string; key: string }
  | { action: "post"; batchId: string }
  | { action: "reject"; batchId: string }
  | { action: "pay"; batchId: string; amount: string; accountId: string; receiptAccountId: string; reference: string; key: string };
const number = (prefix: string) => `${prefix}-${riyadhDateKey(new Date()).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const zero = () => new Prisma.Decimal(0);
export function settlementAmount(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error("INVALID_AMOUNT");
  const amount = new Prisma.Decimal(value);
  if (amount.lte(0)) throw new Error("INVALID_AMOUNT");
  return amount;
}

export async function performWashAction(session: SessionPayload, input: WashAction) {
  return db.$transaction((tx) => washActionInTransaction(tx, session, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function washActionInTransaction(tx: Prisma.TransactionClient, session: SessionPayload, input: WashAction) {
  if (!session.branchId) throw new Error("BRANCH_REQUIRED");
  const branchId = session.branchId;
  const allow = (permission: string) => { if (!hasPermission(session.permissions, permission)) throw new Error("FORBIDDEN"); };
  const audit = async (action: string, entityId: string, afterJson: Prisma.InputJsonObject) => tx.auditLog.create({ data: { actorId: session.userId, action, entityType: "WashSettlement", entityId, afterJson } });

  if (input.action === "configure") {
    allow(P.USER_MANAGE); allow(P.FINANCE_MANAGE);
    const source = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
    const receiver = await tx.branch.findFirst({ where: { id: input.washBranchId, organizationId: source.organizationId } });
    if (!receiver) throw new Error("WASH_BRANCH_NOT_FOUND");
    const old = await tx.washAgreement.findUnique({ where: { sourceBranchId: branchId }, include: { _count: { select: { services: true } } } });
    if (old && old.washBranchId !== receiver.id && old._count.services > 0) throw new Error("AGREEMENT_BRANCH_LOCKED");
    const data = { nameAr: input.nameAr, washBranchId: receiver.id, unitAmount: input.unitAmount ? settlementAmount(input.unitAmount) : null, cadence: input.cadence, issueMode: input.issueMode ?? old?.issueMode ?? "ELIGIBLE" };
    const agreement = await tx.washAgreement.upsert({ where: { sourceBranchId: branchId }, create: { sourceBranchId: branchId, ...data }, update: data });
    await audit("WASH_AGREEMENT_UPDATED", agreement.id, { before: old ? { nameAr: old.nameAr, unitAmount: old.unitAmount?.toString() ?? null, cadence: old.cadence, issueMode: old.issueMode } : null, nameAr: data.nameAr, unitAmount: data.unitAmount?.toString() ?? null, cadence: data.cadence, issueMode: data.issueMode, washBranchId: receiver.id });
    return { agreementId: agreement.id };
  }
  if (input.action === "redeem") {
    allow(P.COUPON_REDEEM);
    const coupon = await tx.coupon.findUnique({ where: { serial: input.serial.toUpperCase() }, include: { invoice: { include: { serviceOrder: true, returns: true } } } });
    if (!coupon) throw new Error("COUPON_NOT_FOUND");
    const agreement = await tx.washAgreement.findFirst({ where: { sourceBranchId: coupon.invoice.serviceOrder.branchId, washBranchId: branchId, active: true } });
    if (!agreement) throw new Error("WASH_AGREEMENT_REQUIRED");
    if (coupon.status !== "ACTIVE") throw new Error("COUPON_NOT_ACTIVE");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error("COUPON_EXPIRED");
    if (coupon.invoice.status === "VOID" || coupon.invoice.returns.some((r) => r.status === "COMPLETED")) throw new Error("INVOICE_REVIEW_REQUIRED");
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
    if (branch.operationalStatus !== "LIVE" && process.env.ALLOW_PREOPENING_OPERATIONS !== "true") throw new Error("BRANCH_NOT_LIVE");
    const updated = await tx.coupon.updateMany({ where: { id: coupon.id, status: "ACTIVE" }, data: { status: "USED", usedAt: new Date(), redeemedBranchId: branchId, redeemedBy: session.userId } });
    if (updated.count !== 1) throw new Error("COUPON_NOT_ACTIVE");
    const service = await tx.washService.create({ data: { serviceNo: number("WS"), couponId: coupon.id, agreementId: agreement.id, amount: agreement.unitAmount, receivedBy: session.userId } });
    await audit("WASH_SERVICE_OPENED", service.id, { source: "YCD OIL", serial: coupon.serial, invoiceNo: coupon.invoice.invoiceNo, serviceNo: service.serviceNo, amount: service.amount?.toString() ?? null });
    return { serviceId: service.id, serviceNo: service.serviceNo };
  }
  if (input.action === "complete" || input.action === "value") {
    const service = await tx.washService.findUnique({ where: { id: input.serviceId }, include: { agreement: true } });
    if (!service) throw new Error("SERVICE_NOT_FOUND");
    if (input.action === "complete") {
      allow(P.COUPON_REDEEM);
      if (service.agreement.washBranchId !== branchId) throw new Error("FORBIDDEN");
      if (service.status === "COMPLETED") return { serviceId: service.id };
      await tx.washService.update({ where: { id: service.id }, data: { status: "COMPLETED", completedAt: new Date(), completedBy: session.userId } });
      await audit("WASH_SERVICE_COMPLETED", service.id, { serviceNo: service.serviceNo });
    } else {
      allow(P.FINANCE_MANAGE);
      if (service.agreement.sourceBranchId !== branchId) throw new Error("FORBIDDEN");
      if (service.batchId) throw new Error("SERVICE_ALREADY_BATCHED");
      const amount = settlementAmount(input.amount);
      await tx.washService.update({ where: { id: service.id }, data: { amount } });
      await audit("WASH_SERVICE_VALUED", service.id, { beforeAmount: service.amount?.toString() ?? null, amount: amount.toString() });
    }
    return { serviceId: service.id };
  }
  if (input.action === "submit") {
    allow(P.COUPON_REDEEM);
    const agreement = await tx.washAgreement.findFirst({ where: { id: input.agreementId, washBranchId: branchId, active: true } });
    if (!agreement) throw new Error("FORBIDDEN");
    const existing = await tx.washBatch.findUnique({ where: { idempotencyKey: input.key } });
    if (existing) {
      if (existing.agreementId !== agreement.id || existing.businessDate !== input.businessDate) throw new Error("IDEMPOTENCY_CONFLICT");
      return { batchId: existing.id };
    }
    const range = riyadhDateRange(input.businessDate, input.businessDate);
    if (!range || input.businessDate > riyadhDateKey(new Date())) throw new Error("INVALID_DATE");
    const services = await tx.washService.findMany({ where: { agreementId: agreement.id, status: "COMPLETED", batchId: null, completedAt: { gte: range.start, lt: range.end } } });
    if (!services.length) throw new Error("NO_COMPLETED_SERVICES");
    if (services.some((s) => !s.amount || s.amount.lte(0))) throw new Error("VALUATION_REQUIRED");
    const total = services.reduce((n, s) => n.plus(s.amount!), zero());
    const batch = await tx.washBatch.create({ data: { batchNo: number("WB"), agreementId: agreement.id, businessDate: input.businessDate, total, submittedBy: session.userId, idempotencyKey: input.key } });
    const linked = await tx.washService.updateMany({ where: { id: { in: services.map((s) => s.id) }, batchId: null }, data: { batchId: batch.id } });
    if (linked.count !== services.length) throw new Error("CONCURRENT_CHANGE");
    await audit("WASH_BATCH_SUBMITTED", batch.id, { total: total.toString(), count: services.length, businessDate: input.businessDate });
    return { batchId: batch.id };
  }
  const batch = await tx.washBatch.findUnique({ where: { id: input.batchId }, include: { agreement: true, payments: true } });
  if (!batch || batch.agreement.sourceBranchId !== branchId) throw new Error("BATCH_NOT_FOUND");
  if (input.action === "post" || input.action === "reject") {
    allow(P.FINANCE_EXPENSE_APPROVE);
    if (batch.submittedBy === session.userId) throw new Error("INDEPENDENT_REVIEW_REQUIRED");
    if (batch.status !== "SUBMITTED") throw new Error("BATCH_NOT_SUBMITTED");
    const status = input.action === "post" ? "POSTED" : "REJECTED";
    await tx.washBatch.update({ where: { id: batch.id }, data: { status, postedAt: input.action === "post" ? new Date() : null, postedBy: session.userId } });
    if (input.action === "reject") await tx.washService.updateMany({ where: { batchId: batch.id }, data: { batchId: null } });
    await audit(`WASH_BATCH_${status}`, batch.id, { batchNo: batch.batchNo, total: batch.total.toString() });
    return { batchId: batch.id };
  }
  allow(P.FINANCE_EXPENSE_PAY);
  const amount = settlementAmount(input.amount);
  const existing = await tx.washSettlement.findUnique({ where: { idempotencyKey: input.key } });
  if (existing) {
    if (existing.batchId !== batch.id || !existing.amount.eq(amount) || existing.reference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
    const [debit, receipt] = await Promise.all([
      tx.financialTransaction.findUnique({ where: { id: existing.sourceTransactionId } }),
      tx.financialTransaction.findUnique({ where: { id: existing.receiptTransactionId } }),
    ]);
    if (debit?.accountId !== input.accountId || receipt?.accountId !== input.receiptAccountId) throw new Error("IDEMPOTENCY_CONFLICT");
    return { settlementId: existing.id };
  }
  if (batch.status !== "POSTED") throw new Error("BATCH_NOT_POSTED");
  const remaining = batch.total.minus(batch.payments.reduce((n, p) => n.plus(p.amount), zero()));
  if (amount.gt(remaining)) throw new Error("PAYMENT_EXCEEDS_BALANCE");
  const from = await tx.financialAccount.findFirst({ where: { id: input.accountId, branchId, active: true, type: { in: ["CASH", "BANK"] } } });
  const to = await tx.financialAccount.findFirst({ where: { id: input.receiptAccountId, branchId: batch.agreement.washBranchId, active: true, type: { in: ["CASH", "BANK"] } } });
  if (!from || !to || from.id === to.id) throw new Error("INVALID_ACCOUNTS");
  const balance = await tx.financialTransaction.aggregate({ where: { accountId: from.id }, _sum: { amount: true } });
  if ((balance._sum.amount ?? zero()).lt(amount)) throw new Error("INSUFFICIENT_FUNDS");
  const settlementNo = number("WP");
  const debit = await tx.financialTransaction.create({ data: { branchId, accountId: from.id, type: "EXPENSE", amount: amount.negated(), reference: input.reference, descriptionAr: `سداد كوبونات غسيل ${batch.batchNo} — ${batch.agreement.nameAr}`, relatedEntityType: "WashBatch", relatedEntityId: batch.id, performedBy: session.userId, idempotencyKey: `wash-out:${input.key}` } });
  const receipt = await tx.financialTransaction.create({ data: { branchId: batch.agreement.washBranchId, accountId: to.id, type: "CUSTOMER_RECEIPT", amount, reference: input.reference, descriptionAr: `تحصيل مستحقات كوبونات YCD OIL ${batch.batchNo}`, relatedEntityType: "WashBatch", relatedEntityId: batch.id, performedBy: session.userId, idempotencyKey: `wash-in:${input.key}` } });
  const payment = await tx.washSettlement.create({ data: { settlementNo, batchId: batch.id, amount, reference: input.reference, paidBy: session.userId, sourceTransactionId: debit.id, receiptTransactionId: receipt.id, idempotencyKey: input.key } });
  await audit("WASH_SETTLEMENT_PAID", payment.id, { batchId: batch.id, amount: amount.toString(), sourceTransactionId: debit.id, receiptTransactionId: receipt.id });
  return { settlementId: payment.id };
}
