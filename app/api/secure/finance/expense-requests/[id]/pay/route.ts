import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const categoryLabel: Record<string, string> = {
  RENT: "إيجار",
  UTILITIES: "خدمات ومرافق",
  FUEL: "وقود ونقل",
  MAINTENANCE: "صيانة",
  SUPPLIES: "مستلزمات تشغيل",
  ADMIN: "مصروفات إدارية",
  OTHER: "أخرى",
};

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_PAY)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const expense = await tx.expenseRequest.findFirst({
        where: { id, branchId: session.branchId! },
        include: { account: true },
      });
      if (!expense) throw new Error("EXPENSE_REQUEST_NOT_FOUND");

      if (expense.status === "PAID" && expense.transactionId) {
        const transaction = await tx.financialTransaction.findUnique({ where: { id: expense.transactionId } });
        if (transaction) return { expense, transaction };
      }
      if (expense.status !== "APPROVED") throw new Error("EXPENSE_APPROVAL_REQUIRED");
      if (!expense.account.active || !["CASH", "BANK"].includes(expense.account.type)) {
        throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
      }

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: expense.accountId },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(expense.amount)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      const transaction = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: expense.accountId,
          type: "EXPENSE",
          amount: expense.amount.negated(),
          reference: expense.reference,
          descriptionAr: `${categoryLabel[expense.category] ?? expense.category} — ${expense.descriptionAr}`,
          recipientName: expense.recipientName,
          recipientPhone: expense.recipientPhone,
          relatedEntityType: "ExpenseRequest",
          relatedEntityId: expense.id,
          performedBy: session.userId,
          idempotencyKey: `expense-request:${expense.id}`,
        },
      });

      const paidExpense = await tx.expenseRequest.update({
        where: { id: expense.id },
        data: {
          status: "PAID",
          paidBy: session.userId,
          paidAt: new Date(),
          transactionId: transaction.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "OPERATING_EXPENSE_PAID",
          entityType: "ExpenseRequest",
          entityId: expense.id,
          afterJson: {
            requestNo: expense.requestNo,
            transactionId: transaction.id,
            accountId: expense.accountId,
            amount: expense.amount.toString(),
          },
        },
      });

      return { expense: paidExpense, transaction };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_PAYMENT_FAILED";
    const status = code === "EXPENSE_REQUEST_NOT_FOUND" || code === "FINANCIAL_ACCOUNT_NOT_FOUND" ? 404
      : code === "EXPENSE_APPROVAL_REQUIRED" || code === "INSUFFICIENT_FINANCIAL_BALANCE" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
