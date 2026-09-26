import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  accountId: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  category: z.enum(["RENT", "UTILITIES", "FUEL", "MAINTENANCE", "SUPPLIES", "ADMIN", "OTHER"]),
  descriptionAr: z.string().trim().min(3).max(300),
  recipientName: z.string().trim().max(160).optional(),
  recipientPhone: z.string().trim().max(30).optional(),
  reference: z.string().trim().max(120).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

const categoryLabel: Record<string, string> = {
  RENT: "إيجار",
  UTILITIES: "خدمات ومرافق",
  FUEL: "وقود ونقل",
  MAINTENANCE: "صيانة",
  SUPPLIES: "مستلزمات تشغيل",
  ADMIN: "مصروفات إدارية",
  OTHER: "أخرى",
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const transaction = await db.$transaction(async (tx) => {
      const key = `expense:${parsed.data.idempotencyReference}`;
      const amount = new Prisma.Decimal(parsed.data.amount);
      const existing = await tx.financialTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.accountId !== parsed.data.accountId || !existing.amount.abs().equals(amount)) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return existing;
      }

      const account = await tx.financialAccount.findFirst({
        where: {
          id: parsed.data.accountId,
          branchId: session.branchId!,
          active: true,
          type: { in: ["CASH", "BANK"] },
        },
      });
      if (!account) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(amount)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      const created = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: account.id,
          type: "EXPENSE",
          amount: amount.negated(),
          reference: parsed.data.reference || null,
          descriptionAr: `${categoryLabel[parsed.data.category]} — ${parsed.data.descriptionAr}`,
          recipientName: parsed.data.recipientName || null,
          recipientPhone: parsed.data.recipientPhone || null,
          relatedEntityType: "OperatingExpense",
          relatedEntityId: parsed.data.idempotencyReference,
          performedBy: session.userId,
          idempotencyKey: key,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "OPERATING_EXPENSE_POSTED",
          entityType: "FinancialTransaction",
          entityId: created.id,
          afterJson: {
            accountId: account.id,
            accountCode: account.code,
            amount: amount.toString(),
            category: parsed.data.category,
            reference: parsed.data.reference || null,
            recipientName: parsed.data.recipientName || null,
          },
        },
      });

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_POST_FAILED";
    const status = code === "INSUFFICIENT_FINANCIAL_BALANCE" ? 409
      : code === "FINANCIAL_ACCOUNT_NOT_FOUND" ? 404
        : code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
