import { nextDocumentNumber } from "@/lib/document-number";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateRange } from "@/lib/time";

const schema = z.object({
  accountId: z.string().min(1),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementBalance: z.coerce.number().min(-100_000_000).max(100_000_000),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const range = riyadhDateRange(parsed.data.statementDate, parsed.data.statementDate);
  if (!range) return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });

  try {
    const reconciliation = await db.$transaction(async (tx) => {
      const account = await tx.financialAccount.findFirst({
        where: {
          id: parsed.data.accountId,
          branchId: session.branchId!,
          active: true,
          type: "BANK",
        },
      });
      if (!account) throw new Error("BANK_ACCOUNT_NOT_FOUND");

      const balanceResult = await tx.financialTransaction.aggregate({
        where: {
          accountId: account.id,
          createdAt: { lt: range.end },
        },
        _sum: { amount: true },
      });
      const systemBalance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      const statementBalance = new Prisma.Decimal(parsed.data.statementBalance);
      const difference = statementBalance.minus(systemBalance);
      const reconciliationNo = await nextDocumentNumber(tx);

      const created = await tx.bankReconciliation.create({
        data: {
          reconciliationNo,
          branchId: session.branchId!,
          accountId: account.id,
          statementDate: new Date(range.end.getTime() - 1),
          systemBalance,
          statementBalance,
          difference,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          preparedBy: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "BANK_RECONCILIATION_PREPARED",
          entityType: "BankReconciliation",
          entityId: created.id,
          afterJson: {
            reconciliationNo,
            accountId: account.id,
            statementDate: parsed.data.statementDate,
            systemBalance: systemBalance.toString(),
            statementBalance: statementBalance.toString(),
            difference: difference.toString(),
          },
        },
      });

      return created;
    });

    return NextResponse.json({ reconciliation }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BANK_RECONCILIATION_FAILED";
    return NextResponse.json({ error: code }, { status: code === "BANK_ACCOUNT_NOT_FOUND" ? 404 : 400 });
  }
}
