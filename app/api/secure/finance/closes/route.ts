import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhFinancialPeriodRange } from "@/lib/time";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DAILY"), period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("MONTHLY"), period: z.string().regex(/^\d{4}-\d{2}$/), notes: z.string().trim().max(500).optional() }),
]);

const zero = () => new Prisma.Decimal(0);
const sumDecimal = <T,>(items: T[], pick: (item: T) => Prisma.Decimal) =>
  items.reduce((sum, item) => sum.plus(pick(item)), zero());

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_PREPARE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const range = riyadhFinancialPeriodRange(parsed.data.type, parsed.data.period);
  if (!range) return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  if (range.end > new Date()) return NextResponse.json({ error: "PERIOD_NOT_FINISHED" }, { status: 409 });

  try {
    const snapshot = await db.$transaction(async (tx) => {
      const existing = await tx.financialClose.findFirst({
        where: {
          branchId: session.branchId!,
          type: parsed.data.type,
          periodStart: range.start,
          periodEnd: range.end,
        },
      });
      if (existing && existing.status !== "DRAFT") return existing;

      const [invoices, payments, returns, financialTransactions, shifts, bankReconciliations] = await Promise.all([
        tx.invoice.findMany({
          where: {
            createdAt: { gte: range.start, lt: range.end },
            status: { not: "VOID" },
            serviceOrder: { branchId: session.branchId! },
          },
          select: { total: true },
        }),
        tx.payment.findMany({
          where: {
            paidAt: { gte: range.start, lt: range.end },
            invoice: { serviceOrder: { branchId: session.branchId! } },
          },
          select: { method: true, amount: true },
        }),
        tx.salesReturn.findMany({
          where: {
            branchId: session.branchId!,
            status: "COMPLETED",
            createdAt: { gte: range.start, lt: range.end },
          },
          select: { total: true },
        }),
        tx.financialTransaction.findMany({
          where: {
            branchId: session.branchId!,
            createdAt: { gte: range.start, lt: range.end },
          },
          select: { type: true, amount: true },
        }),
        tx.shift.findMany({
          where: {
            branchId: session.branchId!,
            openedAt: { gte: range.start, lt: range.end },
          },
          select: {
            closedAt: true,
            cashVariance: true,
            cardVariance: true,
            transferVariance: true,
            varianceResolution: { select: { status: true } },
          },
        }),
        tx.bankReconciliation.findMany({
          where: {
            branchId: session.branchId!,
            statementDate: { gte: range.start, lt: range.end },
          },
          select: { status: true, difference: true },
        }),
      ]);

      const salesTotal = sumDecimal(invoices, (item) => item.total);
      const paymentTotal = (method: "CASH" | "CARD" | "TRANSFER" | "CREDIT") =>
        sumDecimal(payments.filter((item) => item.method === method), (item) => item.amount);
      const refundsTotal = sumDecimal(returns, (item) => item.total);
      const outflow = (type: "EXPENSE" | "SUPPLIER_PAYMENT" | "PAYROLL_PAYMENT" | "CUSTODY_ISSUE") =>
        sumDecimal(financialTransactions.filter((item) => item.type === type), (item) => item.amount.abs());
      const netFinancialMovement = sumDecimal(
        financialTransactions.filter((item) => item.type !== "OPENING_BALANCE"),
        (item) => item.amount,
      );

      const hasVariance = (shift: (typeof shifts)[number]) =>
        Math.abs(Number(shift.cashVariance ?? 0)) > 0.01 ||
        Math.abs(Number(shift.cardVariance ?? 0)) > 0.01 ||
        Math.abs(Number(shift.transferVariance ?? 0)) > 0.01;

      const openShifts = shifts.filter((shift) => !shift.closedAt).length;
      const unresolvedShiftVariances = shifts.filter((shift) =>
        hasVariance(shift) && shift.varianceResolution?.status !== "APPROVED"
      ).length;
      const unresolvedBankReconciliations = bankReconciliations.filter((item) =>
        item.status !== "CLOSED" || Math.abs(Number(item.difference)) > 0.01
      ).length;

      const closeNo = `FC-${parsed.data.type === "DAILY" ? "D" : "M"}-${parsed.data.period.replaceAll("-", "")}-${session.branchId!.slice(-6).toUpperCase()}`;
      const data = {
        closeNo,
        branchId: session.branchId!,
        type: parsed.data.type,
        periodStart: range.start,
        periodEnd: range.end,
        salesTotal,
        cashCollections: paymentTotal("CASH"),
        cardCollections: paymentTotal("CARD"),
        transferCollections: paymentTotal("TRANSFER"),
        creditSales: paymentTotal("CREDIT"),
        refundsTotal,
        operatingExpenses: outflow("EXPENSE"),
        supplierPayments: outflow("SUPPLIER_PAYMENT"),
        payrollPayments: outflow("PAYROLL_PAYMENT"),
        custodyIssues: outflow("CUSTODY_ISSUE"),
        netFinancialMovement,
        openShifts,
        unresolvedShiftVariances,
        unresolvedBankReconciliations,
        preparedBy: session.userId,
        notes: parsed.data.notes || null,
      };

      const close = existing
        ? await tx.financialClose.update({ where: { id: existing.id }, data })
        : await tx.financialClose.create({ data });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "FINANCIAL_CLOSE_PREPARED",
          entityType: "FinancialClose",
          entityId: close.id,
          afterJson: {
            closeNo,
            type: parsed.data.type,
            period: parsed.data.period,
            salesTotal: salesTotal.toString(),
            netFinancialMovement: netFinancialMovement.toString(),
            openShifts,
            unresolvedShiftVariances,
            unresolvedBankReconciliations,
          },
        },
      });

      return close;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ close: snapshot }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FINANCIAL_CLOSE_PREPARE_FAILED";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
