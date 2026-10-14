import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { receiptAccount } from "@/services/cash-drawer";

export type PriceCorrectionInput = {
  invoiceId: string; branchId: string; actorId: string; reason: string;
  receiptTotal: number; paymentReference: string;
  prices: { itemId: string; unitGross: number }[];
};

// A correction is a separate debit document. Original lines, stock, loyalty and coupons are untouched.
export async function correctInvoicePrice(input: PriceCorrectionInput) {
  return db.$transaction(async tx => {
    const original = await tx.invoice.findFirst({
      where: { id: input.invoiceId, serviceOrder: { branchId: input.branchId } },
      include: { correction: true, payments: true, returns: true, serviceOrder: { include: { items: true } } },
    });
    if (!original) throw new Error("INVOICE_NOT_FOUND");
    if (original.documentType !== "INVOICE") throw new Error("CORRECTION_NOT_ALLOWED");
    if (original.correction) throw new Error("CORRECTION_EXISTS");
    if (original.status !== "PAID" || original.returns.length || original.payments.length !== 1) throw new Error("CORRECTION_NOT_ALLOWED");
    const payment = original.payments[0];
    if (payment.method === "CREDIT" || !payment.amount.eq(original.total) || payment.reference !== input.paymentReference) throw new Error("RECEIPT_MISMATCH");
    const targets = new Map(input.prices.map(p => [p.itemId, new Prisma.Decimal(p.unitGross)]));
    if (targets.size !== input.prices.length || targets.size !== original.serviceOrder.items.length) throw new Error("INVALID_PRICES");
    let targetGross = new Prisma.Decimal(0), targetNet = new Prisma.Decimal(0);
    const lines: { descriptionAr: string; quantity: number; unitPrice: Prisma.Decimal; discount: number }[] = [];
    for (const item of original.serviceOrder.items) {
      const grossPrice = targets.get(item.id);
      if (!grossPrice || grossPrice.lt(0)) throw new Error("INVALID_PRICES");
      const gross = grossPrice.mul(item.quantity).toDecimalPlaces(2);
      const net = gross.div(new Prisma.Decimal(1).plus(original.vatRate)).toDecimalPlaces(2);
      const before = item.unitPrice.mul(item.quantity).minus(item.discount).toDecimalPlaces(2);
      const difference = net.minus(before);
      if (difference.lt(0)) throw new Error("PRICE_DECREASE_NOT_SUPPORTED");
      targetGross = targetGross.plus(gross);
      targetNet = targetNet.plus(net);
      if (difference.gt(0)) lines.push({ descriptionAr: `فرق سعر: ${item.descriptionAr}`, quantity: 1, unitPrice: difference, discount: 0 });
    }
    const total = targetGross.minus(original.total).toDecimalPlaces(2);
    const subtotal = targetNet.minus(original.subtotal).toDecimalPlaces(2);
    const vatAmount = targetGross.minus(targetNet).minus(original.vatAmount).toDecimalPlaces(2);
    if (total.lte(0) || subtotal.lte(0) || vatAmount.lt(0) ||
        !subtotal.plus(vatAmount).eq(total) ||
        !lines.reduce((s,l)=>s.plus(l.unitPrice),new Prisma.Decimal(0)).eq(subtotal)) throw new Error("INVALID_CORRECTION_TOTAL");
    if (!targetGross.eq(input.receiptTotal) || !payment.amount.plus(total).eq(input.receiptTotal)) throw new Error("RECEIPT_MISMATCH");
    const shift = await tx.shift.findFirst({ where: { branchId: input.branchId, closedAt: null }, orderBy: { openedAt: "desc" } });
    if (!shift) throw new Error("OPEN_SHIFT_REQUIRED");
    const account = await receiptAccount(tx,input.branchId,payment.method === "CARD" ? "POS_CLEARING" : payment.method === "CASH" ? "CASH" : "BANK");
    if (!account) throw new Error("FINANCIAL_ACCOUNT_REQUIRED");
    const key = `price-correction:${original.id}`;
    const documentNo = await nextDocumentNumber(tx);
    // Internal financial container; excluded from reception lists and vehicle visit counts.
    const order = await tx.serviceOrder.create({ data: {
      orderNo: `ADJ-${documentNo}`, channel: "PRICE_CORRECTION", branchId: input.branchId,
      shiftId: shift.id, customerId: original.customerId, vehicleId: original.serviceOrder.vehicleId,
      odometer: original.serviceOrder.odometer, status: "COMPLETED", items: { create: lines },
    } });
    const note = await tx.invoice.create({ data: {
      invoiceNo: documentNo, documentType: "DEBIT_NOTE", correctionOfId: original.id,
      correctionReason: input.reason, serviceOrderId: order.id, customerId: original.customerId,
      buyerCompanyName: original.buyerCompanyName, buyerVatNumber: original.buyerVatNumber,
      subtotal, vatRate: original.vatRate, vatAmount, total, status: "PAID",
      payments: { create: { shiftId: shift.id, method: payment.method, amount: total, reference: input.paymentReference, idempotencyKey: key } },
    } });
    await tx.financialTransaction.create({ data: {
      branchId: input.branchId, accountId: account.id, type: "CUSTOMER_RECEIPT", amount: total,
      reference: input.paymentReference, descriptionAr: `استكمال تسجيل إيصال سابق — إشعار ${documentNo} عن ${original.invoiceNo}`,
      relatedEntityType: "Invoice", relatedEntityId: note.id, performedBy: input.actorId,
      idempotencyKey: `customer-receipt:${key}`,
    } });
    await tx.auditLog.create({ data: {
      actorId: input.actorId, action: "INVOICE_PRICE_CORRECTED", entityType: "Invoice", entityId: original.id,
      beforeJson: { total: original.total.toString(), paid: payment.amount.toString() },
      afterJson: { noteId: note.id, noteNo: documentNo, difference: total.toString(), receiptTotal: targetGross.toString(),
        reason: input.reason, reference: input.paymentReference, originalPaymentId: payment.id, originalPaidAt: payment.paidAt.toISOString(),
        prices: input.prices, stockChanged: false, newCustomerCharge: false },
    } });
    return note;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
