import { FinancialAccountType, Prisma, Shift } from "@prisma/client";

// Cash receipts/refunds always use the explicitly designated drawer once configured.
export async function receiptAccount(tx: Prisma.TransactionClient, branchId: string, type: FinancialAccountType) {
  if (type === "CASH") {
    const drawer = await tx.financialAccount.findFirst({ where: { branchId, cashRole: "DRAWER" } });
    if (drawer) {
      if (!drawer.active) throw new Error("CASH_DRAWER_INACTIVE");
      const shift = await tx.shift.findFirst({ where: { branchId, closedAt: null, drawerAccountId: drawer.id } });
      if (!shift) throw new Error("OPEN_SHIFT_REQUIRED");
      return drawer;
    }
  }
  return tx.financialAccount.findFirst({ where: { branchId, type, active: true }, orderBy: { createdAt: "asc" } });
}

export function cashTotal(openingCash: Prisma.Decimal, movements: { amount: Prisma.Decimal }[]) {
  return movements.reduce((sum, row) => sum.plus(row.amount), openingCash);
}

export async function drawerSummary(tx: Prisma.TransactionClient, shift: Shift, end = shift.closedAt ?? new Date()) {
  if (!shift.drawerAccountId) return null;
  const movements = await tx.financialTransaction.findMany({
    where: { branchId: shift.branchId, accountId: shift.drawerAccountId, createdAt: { gte: shift.openedAt, lt: end } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return { movements, expectedCash: cashTotal(shift.openingCash, movements) };
}

export async function configureCashDrawer(tx: Prisma.TransactionClient, branchId: string, actorId: string, drawerId: string, treasuryId?: string) {
  const existing = await tx.financialAccount.findMany({ where: { branchId, cashRole: { not: null } } });
  // Configuration is deliberately one-time; moving a drawer requires a reviewed migration.
  if (existing.length) {
    if (existing.some(a => a.cashRole === "DRAWER" && a.id === drawerId) && existing.some(a => a.cashRole === "TREASURY" && (!treasuryId || a.id === treasuryId))) return;
    throw new Error("CASH_POLICY_LOCKED");
  }
  const drawer = await tx.financialAccount.findFirst({ where: { id: drawerId, branchId, active: true, type: "CASH", cashRole: null } });
  if (!drawer) throw new Error("INVALID_DRAWER");
  const washReceipt = await tx.financialTransaction.findFirst({ where: { accountId: drawer.id, relatedEntityType: "WashBatch", type: "CUSTOMER_RECEIPT" } });
  if (washReceipt) throw new Error("INVALID_DRAWER");
  const shifts = await tx.shift.findMany({ where: { branchId, closedAt: null } });
  if (shifts.length > 1) throw new Error("MULTIPLE_OPEN_SHIFTS");
  const open = shifts[0];
  let recognized: { id: string; amount: string }[] = [];
  let corrected: string | null = null;
  if (open) {
    const payments = await tx.payment.findMany({ where: { shiftId: open.id, method: "CASH" } });
    const refunds = await tx.salesReturn.findMany({ where: { branchId, status: "COMPLETED", refundMethod: "CASH", refundAmount: { gt: 0 }, createdAt: { gte: open.openedAt } } });
    // Verify every existing receipt/refund against its original ledger posting.
    for (const payment of payments) {
      if (!payment.idempotencyKey) throw new Error("LEGACY_REVIEW_REQUIRED");
      const posting = await tx.financialTransaction.findUnique({ where: { idempotencyKey: `customer-receipt:${payment.idempotencyKey}` } });
      if (!posting || posting.accountId !== drawer.id || !posting.amount.eq(payment.amount) || posting.createdAt < open.openedAt) throw new Error("LEGACY_REVIEW_REQUIRED");
    }
    for (const refund of refunds) {
      const posting = await tx.financialTransaction.findUnique({ where: { idempotencyKey: `customer-refund:${refund.idempotencyKey}` } });
      if (!posting || posting.accountId !== drawer.id || !posting.amount.eq(refund.refundAmount.negated())) throw new Error("LEGACY_REVIEW_REQUIRED");
    }
    const prior = await tx.financialTransaction.aggregate({ where: { accountId: drawer.id, createdAt: { lt: open.openedAt } }, _sum: { amount: true } });
    if (!(prior._sum.amount ?? new Prisma.Decimal(0)).eq(open.openingCash)) throw new Error("OPENING_REVIEW_REQUIRED");
    const summary = await drawerSummary(tx, { ...open, drawerAccountId: drawer.id });
    const receiptKeys = new Set(payments.map(row => `customer-receipt:${row.idempotencyKey}`));
    const refundKeys = new Set(refunds.map(row => `customer-refund:${row.idempotencyKey}`));
    if (summary!.movements.some(row => (row.type === "CUSTOMER_RECEIPT" && row.relatedEntityType === "Invoice" && !receiptKeys.has(row.idempotencyKey ?? "")) || (row.type === "CUSTOMER_REFUND" && !refundKeys.has(row.idempotencyKey ?? "")))) throw new Error("LEGACY_REVIEW_REQUIRED");
    recognized = summary!.movements.map(row => ({ id: row.id, amount: row.amount.toString() }));
    corrected = summary!.expectedCash.toString();
    await tx.shift.update({ where: { id: open.id }, data: { drawerAccountId: drawer.id } });
  }
  let treasury;
  if (treasuryId) {
    treasury = await tx.financialAccount.findFirst({ where: { id: treasuryId, branchId, type: "CASH", active: true, cashRole: null } });
    if (!treasury || treasury.id === drawer.id) throw new Error("INVALID_TREASURY");
    if (await tx.financialTransaction.findFirst({ where: { accountId: treasury.id, relatedEntityType: "WashBatch", type: "CUSTOMER_RECEIPT" } })) throw new Error("INVALID_TREASURY");
  } else {
    // Zero balance: no funding or opening-balance posting is manufactured.
    treasury = await tx.financialAccount.create({ data: { branchId, code: "ADMIN-TREASURY", nameAr: "صندوق الإدارة", type: "CASH" } });
  }
  await tx.financialAccount.update({ where: { id: drawer.id }, data: { cashRole: "DRAWER" } });
  await tx.financialAccount.update({ where: { id: treasury.id }, data: { cashRole: "TREASURY" } });
  await tx.auditLog.create({ data: { actorId, action: "CASH_DRAWER_SEPARATED", entityType: "Branch", entityId: branchId,
    afterJson: { drawerAccountId: drawer.id, treasuryAccountId: treasury.id, shiftId: open?.id ?? null, recognizedMovements: recognized, correctedExpectedCash: corrected, financialPostingsChanged: false } } });
}
