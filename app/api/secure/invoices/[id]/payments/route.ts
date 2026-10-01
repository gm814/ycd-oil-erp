import { captureMedad } from "@/services/medad/outbox";
import { earnLoyalty } from "@/services/loyalty";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  amount: z.coerce.number().positive().max(10_000_000),
  reference: z.string().trim().max(120).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PAYMENT_RECEIVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyReference },
        include: { invoice: true },
      });
      if (existing) return { payment: existing, invoice: existing.invoice };

      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          payments: { select: { amount: true } },
          returns: { where: { status: "COMPLETED" }, select: { total: true, refundAmount: true } },
          serviceOrder: { select: { branchId: true } },
        },
      });
      if (!invoice || invoice.serviceOrder.branchId !== session.branchId) {
        throw new Error("INVOICE_NOT_FOUND");
      }
      if (invoice.status === "VOID") throw new Error("INVOICE_VOID");
      if (invoice.status === "PAID") throw new Error("INVOICE_ALREADY_PAID");

      const paid = invoice.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const returnedTotal = invoice.returns.reduce(
        (sum, item) => sum.plus(item.total),
        new Prisma.Decimal(0),
      );
      const refunded = invoice.returns.reduce(
        (sum, item) => sum.plus(item.refundAmount),
        new Prisma.Decimal(0),
      );
      const effectiveTotal = Prisma.Decimal.max(invoice.total.minus(returnedTotal), new Prisma.Decimal(0));
      const netPaid = Prisma.Decimal.max(paid.minus(refunded), new Prisma.Decimal(0));
      const outstanding = Prisma.Decimal.max(effectiveTotal.minus(netPaid), new Prisma.Decimal(0));
      const amount = new Prisma.Decimal(parsed.data.amount);
      if (amount.greaterThan(outstanding)) throw new Error("PAYMENT_EXCEEDS_BALANCE");

      let shiftId: string | null = null;
      if (parsed.data.method === "CASH" || parsed.data.method === "CARD") {
        const openShift = await tx.shift.findFirst({
          where: { branchId: session.branchId!, closedAt: null },
          orderBy: { openedAt: "desc" },
        });
        if (!openShift) throw new Error("OPEN_SHIFT_REQUIRED");
        shiftId = openShift.id;
      }

      const accountType = parsed.data.method === "CASH"
        ? "CASH"
        : parsed.data.method === "CARD"
          ? "POS_CLEARING"
          : "BANK";
      const account = await tx.financialAccount.findFirst({
        where: { branchId: session.branchId!, type: accountType, active: true },
        orderBy: { createdAt: "asc" },
      });
      if (!account) throw new Error("FINANCIAL_ACCOUNT_REQUIRED");

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          shiftId,
          method: parsed.data.method,
          amount,
          reference: parsed.data.reference || null,
          idempotencyKey: parsed.data.idempotencyReference,
        },
      });

      const newNetPaid = netPaid.plus(amount);
      const newStatus = newNetPaid.greaterThanOrEqualTo(effectiveTotal) ? "PAID" : "PARTIALLY_PAID";
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });

      await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: account.id,
          type: "CUSTOMER_RECEIPT",
          amount,
          reference: parsed.data.reference || invoice.invoiceNo,
          descriptionAr: `تحصيل من فاتورة العميل ${invoice.invoiceNo}`,
          relatedEntityType: "Invoice",
          relatedEntityId: invoice.id,
          performedBy: session.userId,
          idempotencyKey: `customer-receipt:${parsed.data.idempotencyReference}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "CUSTOMER_PAYMENT_RECEIVED",
          entityType: "Invoice",
          entityId: invoice.id,
          afterJson: {
            paymentId: payment.id,
            method: payment.method,
            amount: payment.amount.toString(),
            invoiceStatus: newStatus,
            outstandingAfter: Prisma.Decimal.max(effectiveTotal.minus(newNetPaid), new Prisma.Decimal(0)).toString(),
          },
        },
      });

      await earnLoyalty(tx, invoice.id);
      await captureMedad(tx, session.branchId!, "PAYMENT", payment.id, `${invoice.invoiceNo} / ${payment.id}`);
      return { payment, invoice: updatedInvoice };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_RECEIVE_FAILED";
    const status = code.endsWith("_NOT_FOUND") ? 404 : code === "PAYMENT_EXCEEDS_BALANCE" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
