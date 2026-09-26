import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  sourceCompanyId: z.string().min(1),
  accountId: z.string().min(1),
  amount: z.coerce.number().positive().max(100_000_000),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.GROUP_FUNDING_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const key = `group-funding:${parsed.data.idempotencyReference}`;
      const existingTransaction = await tx.financialTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existingTransaction) {
        const existingFunding = await tx.groupFunding.findUnique({ where: { transactionId: existingTransaction.id } });
        if (!existingFunding) throw new Error("IDEMPOTENCY_CONFLICT");
        return { funding: existingFunding, transaction: existingTransaction };
      }

      const [sourceCompany, account] = await Promise.all([
        tx.groupCompany.findFirst({
          where: {
            id: parsed.data.sourceCompanyId,
            active: true,
            organization: { branches: { some: { id: session.branchId! } } },
          },
        }),
        tx.financialAccount.findFirst({
          where: {
            id: parsed.data.accountId,
            branchId: session.branchId!,
            active: true,
            type: { in: ["CASH", "BANK"] },
          },
        }),
      ]);
      if (!sourceCompany) throw new Error("GROUP_COMPANY_NOT_FOUND");
      if (!account) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");

      const amount = new Prisma.Decimal(parsed.data.amount);
      const transaction = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: account.id,
          type: "GROUP_FUNDING",
          amount,
          reference: parsed.data.reference || null,
          descriptionAr: `تمويل من ${sourceCompany.legalNameAr}`,
          relatedEntityType: "GroupCompany",
          relatedEntityId: sourceCompany.id,
          performedBy: session.userId,
          idempotencyKey: key,
        },
      });

      const funding = await tx.groupFunding.create({
        data: {
          fundingNo: `FUND-${parsed.data.idempotencyReference}`,
          branchId: session.branchId!,
          sourceCompanyId: sourceCompany.id,
          accountId: account.id,
          amount,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          fundedAt: new Date(),
          transactionId: transaction.id,
          createdBy: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "GROUP_FUNDING_RECEIVED",
          entityType: "GroupFunding",
          entityId: funding.id,
          afterJson: {
            fundingNo: funding.fundingNo,
            sourceCompanyId: sourceCompany.id,
            sourceCompanyNameAr: sourceCompany.legalNameAr,
            accountId: account.id,
            amount: amount.toString(),
            reference: funding.reference,
          },
        },
      });

      return { funding, transaction };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GROUP_FUNDING_FAILED";
    const status = ["GROUP_COMPANY_NOT_FOUND", "FINANCIAL_ACCOUNT_NOT_FOUND"].includes(code) ? 404
      : code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
