import { nextDocumentNumber } from "@/lib/document-number";
import { captureMedad } from "@/services/medad/outbox";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type ReturnInput = {
  invoiceId: string;
  branchId: string;
  actorId: string;
  reason: string;
  refundMethod?: "CASH" | "CARD" | "TRANSFER";
  refundReference?: string;
  idempotencyReference: string;
  items: { serviceOrderItemId: string; quantity: number }[];
};

export async function processSalesReturn(input: ReturnInput) {
  return db.$transaction(async (tx) => {
    const existing = await tx.salesReturn.findUnique({
      where: { idempotencyKey: input.idempotencyReference },
      include: { items: true },
    });
    if (existing) return existing;

    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        payments: { select: { amount: true } },
        returns: { where: { status: "COMPLETED" }, include: { items: true } },
        serviceOrder: { include: { items: { include: { product: true } } } },
      },
    });
    if (!invoice || invoice.serviceOrder.branchId !== input.branchId) throw new Error("INVOICE_NOT_FOUND");
    if (invoice.status === "VOID") throw new Error("INVOICE_VOID");

    const requested = new Map(input.items.map((item) => [item.serviceOrderItemId, new Prisma.Decimal(item.quantity)]));
    if (requested.size !== input.items.length) throw new Error("DUPLICATE_RETURN_ITEM");

    const returned = new Map<string, Prisma.Decimal>();
    for (const prior of invoice.returns) {
      for (const item of prior.items) {
        returned.set(item.serviceOrderItemId, (returned.get(item.serviceOrderItemId) ?? new Prisma.Decimal(0)).plus(item.quantity));
      }
    }

    const lines = [];
    for (const [itemId, quantity] of requested) {
      const source = invoice.serviceOrder.items.find((item) => item.id === itemId);
      if (!source) throw new Error("RETURN_ITEM_NOT_FOUND");
      const available = source.quantity.minus(returned.get(source.id) ?? new Prisma.Decimal(0));
      if (quantity.greaterThan(available)) throw new Error("RETURN_QUANTITY_EXCEEDED");
      const unitNet = source.unitPrice.mul(source.quantity).minus(source.discount).div(source.quantity);
      lines.push({
        serviceOrderItemId: source.id,
        productId: source.productId,
        productCategory: source.product?.category ?? null,
        quantity,
        unitNet,
        lineSubtotal: unitNet.mul(quantity).toDecimalPlaces(2),
      });
    }

    const subtotal = lines.reduce((sum, item) => sum.plus(item.lineSubtotal), new Prisma.Decimal(0));
    const vatAmount = subtotal.mul(invoice.vatRate).toDecimalPlaces(2);
    const total = subtotal.plus(vatAmount);
    const priorReturnTotal = invoice.returns.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));
    const priorRefunds = invoice.returns.reduce((sum, item) => sum.plus(item.refundAmount), new Prisma.Decimal(0));
    const paid = invoice.payments.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    const effectiveTotalAfter = Prisma.Decimal.max(invoice.total.minus(priorReturnTotal).minus(total), 0);
    const netPaidBefore = Prisma.Decimal.max(paid.minus(priorRefunds), 0);
    const refundAmount = Prisma.Decimal.min(total, Prisma.Decimal.max(netPaidBefore.minus(effectiveTotalAfter), 0));

    let accountId: string | null = null;
    if (refundAmount.greaterThan(0)) {
      if (!input.refundMethod) throw new Error("REFUND_METHOD_REQUIRED");
      if (input.refundMethod === "CASH" || input.refundMethod === "CARD") {
        const openShift = await tx.shift.findFirst({ where: { branchId: input.branchId, closedAt: null } });
        if (!openShift) throw new Error("OPEN_SHIFT_REQUIRED");
      }
      const type = input.refundMethod === "CASH" ? "CASH" : input.refundMethod === "CARD" ? "POS_CLEARING" : "BANK";
      const account = await tx.financialAccount.findFirst({ where: { branchId: input.branchId, type, active: true } });
      if (!account) throw new Error("FINANCIAL_ACCOUNT_REQUIRED");

      if (input.refundMethod === "CASH" || input.refundMethod === "TRANSFER") {
        const balanceResult = await tx.financialTransaction.aggregate({
          where: { accountId: account.id },
          _sum: { amount: true },
        });
        const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
        if (balance.lessThan(refundAmount)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");
      }
      accountId = account.id;
    }

    const salesReturn = await tx.salesReturn.create({
      data: {
        returnNo: await nextDocumentNumber(tx),
        invoiceId: invoice.id,
        branchId: input.branchId,
        reason: input.reason,
        subtotal,
        vatAmount,
        total,
        refundMethod: refundAmount.greaterThan(0) ? input.refundMethod : null,
        refundAmount,
        refundReference: refundAmount.greaterThan(0) ? input.refundReference || null : null,
        idempotencyKey: input.idempotencyReference,
        processedBy: input.actorId,
        items: {
          create: lines.map(({ productCategory: _category, ...line }) => line),
        },
      },
      include: { items: true },
    });

    for (const line of lines) {
      if (!line.productId || line.productCategory === "SERVICE") continue;
      await tx.stockMovement.create({
        data: {
          branchId: input.branchId,
          productId: line.productId,
          type: "RETURN",
          quantity: line.quantity,
          reference: salesReturn.returnNo,
          performedBy: input.actorId,
        },
      });
    }

    if (accountId && refundAmount.greaterThan(0)) {
      await tx.financialTransaction.create({
        data: {
          branchId: input.branchId,
          accountId,
          type: "CUSTOMER_REFUND",
          amount: refundAmount.negated(),
          reference: input.refundReference || salesReturn.returnNo,
          descriptionAr: `استرداد عميل عن ${salesReturn.returnNo}`,
          relatedEntityType: "SalesReturn",
          relatedEntityId: salesReturn.id,
          performedBy: input.actorId,
          idempotencyKey: `customer-refund:${input.idempotencyReference}`,
        },
      });
    }

    const netPaidAfter = netPaidBefore.minus(refundAmount);
    const status = effectiveTotalAfter.lessThanOrEqualTo(0) || netPaidAfter.greaterThanOrEqualTo(effectiveTotalAfter)
      ? "PAID"
      : netPaidAfter.greaterThan(0) ? "PARTIALLY_PAID" : "ISSUED";
    await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    await tx.loyaltyEntry.updateMany({ where: { invoiceId: invoice.id }, data: { revoked: true } });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SALES_RETURN_COMPLETED",
        entityType: "SalesReturn",
        entityId: salesReturn.id,
        afterJson: {
          invoiceId: invoice.id,
          returnNo: salesReturn.returnNo,
          total: total.toString(),
          refundAmount: refundAmount.toString(),
          invoiceStatus: status,
        },
      },
    });

    await captureMedad(tx, input.branchId, "RETURN", salesReturn.id, salesReturn.returnNo);
    return salesReturn;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
