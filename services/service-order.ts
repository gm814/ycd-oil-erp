import { Prisma, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";

type CompleteServiceInput = {
  serviceOrderId: string;
  actorId: string;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "CREDIT";
  paymentReference?: string;
  idempotencyReference: string;
};

export async function completeServiceOrder(input: CompleteServiceInput) {
  return db.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyReference },
      include: { invoice: true },
    });
    if (existingPayment) return existingPayment.invoice;

    const order = await tx.serviceOrder.findUnique({
      where: { id: input.serviceOrderId },
      include: { items: true, vehicle: true, invoice: true },
    });
    if (!order) throw new Error("SERVICE_ORDER_NOT_FOUND");
    if (order.invoice) return order.invoice;
    if (order.status === "CANCELLED") throw new Error("SERVICE_ORDER_CANCELLED");
    if (order.items.length === 0) throw new Error("SERVICE_ORDER_EMPTY");

    for (const item of order.items) {
      if (!item.productId) continue;
      const aggregate = await tx.stockMovement.aggregate({
        where: { branchId: order.branchId, productId: item.productId },
        _sum: { quantity: true },
      });
      const available = aggregate._sum.quantity ?? new Prisma.Decimal(0);
      if (available.lessThan(item.quantity)) {
        throw new Error("INSUFFICIENT_STOCK");
      }
    }

    const subtotal = order.items.reduce(
      (sum, item) => sum.plus(item.unitPrice.mul(item.quantity).minus(item.discount)),
      new Prisma.Decimal(0),
    );
    const vatRate = new Prisma.Decimal(companyConfig.vatRate);
    const vatAmount = subtotal.mul(vatRate).toDecimalPlaces(2);
    const total = subtotal.plus(vatAmount);

    for (const item of order.items) {
      if (!item.productId) continue;
      await tx.stockMovement.create({
        data: {
          branchId: order.branchId,
          productId: item.productId,
          type: StockMovementType.ISSUE,
          quantity: item.quantity.negated(),
          reference: order.orderNo,
          performedBy: input.actorId,
        },
      });
    }

    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: `INV-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        serviceOrderId: order.id,
        customerId: order.customerId,
        subtotal,
        vatRate,
        vatAmount,
        total,
        status: "PAID",
        payments: {
          create: {
            method: input.paymentMethod,
            amount: total,
            reference: input.paymentReference || null,
            idempotencyKey: input.idempotencyReference,
          },
        },
      },
    });

    await tx.vehicleHistory.create({
      data: {
        vehicleId: order.vehicleId,
        serviceOrderId: order.id,
        odometer: order.odometer,
        summaryAr: "تم إكمال أمر الخدمة وإصدار الفاتورة.",
      },
    });

    await tx.serviceOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED" },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SERVICE_ORDER_COMPLETED",
        entityType: "ServiceOrder",
        entityId: order.id,
        afterJson: { invoiceId: invoice.id, total: total.toString() },
      },
    });

    return invoice;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
