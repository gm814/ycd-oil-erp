import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const reconciliation = await db.$transaction(async (tx) => {
      const current = await tx.bankReconciliation.findFirst({
        where: { id, branchId: session.branchId! },
      });
      if (!current) throw new Error("RECONCILIATION_NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("RECONCILIATION_NOT_DRAFT");

      // statementDate is stored as the last millisecond of the Riyadh statement day.
      const end = new Date(current.statementDate.getTime() + 1);

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: current.accountId, createdAt: { lt: end } },
        _sum: { amount: true },
      });
      const systemBalance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      const difference = current.statementBalance.minus(systemBalance);

      const updated = await tx.bankReconciliation.update({
        where: { id: current.id },
        data: { systemBalance, difference },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "BANK_RECONCILIATION_REFRESHED",
          entityType: "BankReconciliation",
          entityId: current.id,
          afterJson: {
            systemBalance: systemBalance.toString(),
            statementBalance: current.statementBalance.toString(),
            difference: difference.toString(),
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ reconciliation });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECONCILIATION_REFRESH_FAILED";
    const status = code === "RECONCILIATION_NOT_FOUND" ? 404
      : code === "RECONCILIATION_NOT_DRAFT" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
