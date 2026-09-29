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
  if (!hasPermission(session.permissions, PERMISSIONS.SUPPLIER_PAYMENT_EXECUTE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const invoice = await db.$transaction(async (tx) => {
      const existing = await tx.financialTransaction.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyReference },
      });
      if (existing?.relatedEntityType === "SupplierInvoice" && existing.relatedEntityId === id) {
        return tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
      }

      const current = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!current || current.branchId !== session.branchId) throw new Error("SUPPLIER_INVOICE_NOT_FOUND");
      if (current.status !== "APPROVED_FOR_PAYMENT") throw new Error("PAYMENT_APPROVAL_REQUIRED");

      const account = await tx.financialAccount.findUnique({ where: { id: parsed.data.accountId } });
      if (!account || account.branchId !== session.branchId || !account.active) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
      if (account.type === "POS_CLEARING") throw new Error("INVALID_PAYMENT_ACCOUNT");

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(current.total)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: account.id,
          type: "SUPPLIER_PAYMENT",
          amount: current.total.negated(),
          reference: parsed.data.reference || null,
          descriptionAr: `سداد فاتورة مورد ${current.invoiceNo}`,
          relatedEntityType: "SupplierInvoice",
          relatedEntityId: current.id,
          performedBy: session.userId,
          idempotencyKey: parsed.data.idempotencyReference,
        },
      });

      const updated = await tx.supplierInvoice.update({
        where: { id: current.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentReference: parsed.data.reference || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SUPPLIER_INVOICE_PAID",
          entityType: "SupplierInvoice",
          entityId: current.id,
          afterJson: { accountId: account.id, amount: current.total.toString(), reference: parsed.data.reference || null },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ invoice });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPLIER_PAYMENT_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
