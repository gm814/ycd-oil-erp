import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  accountId: z.string().min(1),
  reference: z.string().trim().max(120).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTODY_DISBURSE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  try {
    const custody = await db.$transaction(async (tx) => {
      const current = await tx.custodyRequest.findUnique({ where: { id } });
      if (!current || current.branchId !== session.branchId) throw new Error("CUSTODY_NOT_FOUND");
      if (current.status !== "APPROVED" || !current.approvedAmount) throw new Error("CUSTODY_NOT_APPROVED");

      const account = await tx.financialAccount.findUnique({ where: { id: parsed.data.accountId } });
      if (!account || account.branchId !== session.branchId || !account.active || account.type === "POS_CLEARING") {
        throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
      }

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(current.approvedAmount)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      await tx.financialTransaction.create({
        data: {
          branchId: current.branchId,
          accountId: account.id,
          type: "CUSTODY_ISSUE",
          amount: current.approvedAmount.negated(),
          reference: parsed.data.reference || null,
          descriptionAr: `إثبات صرف عهدة ${current.custodyNo}`,
          recipientName: current.custodianName,
          recipientPhone: current.custodianPhone,
          relatedEntityType: "CustodyRequest",
          relatedEntityId: current.id,
          performedBy: session.userId,
        },
      });

      const updated = await tx.custodyRequest.update({
        where: { id },
        data: { status: "DISBURSED", sourceAccountId: account.id, disbursedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "CUSTODY_LEDGER_ISSUE_POSTED",
          entityType: "CustodyRequest",
          entityId: id,
          afterJson: { accountId: account.id, amount: current.approvedAmount.toString(), reference: parsed.data.reference || null },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ custody });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTODY_ISSUE_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
