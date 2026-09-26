import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  accountId: z.string().min(1),
  reference: z.string().trim().max(120).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PAYROLL_PAY)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  try {
    const period = await db.$transaction(async (tx) => {
      const duplicate = await tx.financialTransaction.findUnique({ where: { idempotencyKey: parsed.data.idempotencyReference } });
      if (duplicate?.relatedEntityType === "PayrollPeriod" && duplicate.relatedEntityId === id) {
        return tx.payrollPeriod.findUniqueOrThrow({ where: { id } });
      }

      const current = await tx.payrollPeriod.findUnique({ where: { id }, include: { lines: true } });
      if (!current || current.branchId !== session.branchId) throw new Error("PAYROLL_NOT_FOUND");
      if (current.status !== "APPROVED") throw new Error("PAYROLL_NOT_APPROVED");

      const account = await tx.financialAccount.findUnique({ where: { id: parsed.data.accountId } });
      if (!account || account.branchId !== session.branchId || !account.active || account.type === "POS_CLEARING") {
        throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
      }

      const total = current.lines.reduce((sum, line) => sum.plus(line.netSalary), new Prisma.Decimal(0));
      const balanceResult = await tx.financialTransaction.aggregate({ where: { accountId: account.id }, _sum: { amount: true } });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(total)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      await tx.financialTransaction.create({
        data: {
          branchId: current.branchId,
          accountId: account.id,
          type: "PAYROLL_PAYMENT",
          amount: total.negated(),
          reference: parsed.data.reference || null,
          descriptionAr: `صرف مسير رواتب ${current.month}/${current.year}`,
          relatedEntityType: "PayrollPeriod",
          relatedEntityId: current.id,
          performedBy: session.userId,
          idempotencyKey: parsed.data.idempotencyReference,
        },
      });
      const updated = await tx.payrollPeriod.update({
        where: { id },
        data: { status: "PAID", paidBy: session.userId, paidAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "PAYROLL_PAID",
          entityType: "PayrollPeriod",
          entityId: id,
          afterJson: { total: total.toString(), accountId: account.id, reference: parsed.data.reference || null },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ period });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYROLL_PAYMENT_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
