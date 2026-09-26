import { Prisma, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";

type CompleteServiceInput = {
  serviceOrderId: string;
  actorId: string;
  branchId: string;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "CREDIT";
  paymentReference?: string;
  nextServiceKm?: number;
  nextServiceAt?: Date;
  idempotencyReference: string;
};

export async function completeServiceOrder(input: CompleteServiceInput) {
  return db.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyReference },
      include: { invoice: { include: { coupons: true } } },
    });
    if (existingPayment) return existingPayment.invoice;

    const order = await tx.serviceOrder.findUnique({
      where: { id: input.serviceOrderId },
      include: {
        items: { include: { product: true } },
        vehicle: true,
        customer: true,
        invoice: { include: { coupons: true } },
      },
    });
    if (!order || order.branchId !== input.branchId) throw new Error("SERVICE_ORDER_NOT_FOUND");
    if (order.invoice) return order.invoice;
    if (order.status === "CANCELLED") throw new Error("SERVICE_ORDER_CANCELLED");
    if (order.items.length === 0) throw new Error("SERVICE_ORDER_EMPTY");
    if (!order.shiftId) throw new Error("SHIFT_REQUIRED");

    for (const item of order.items) {
      if (!item.productId || item.product?.category === "SERVICE") continue;
      const aggregate = await tx.stockMovement.aggregate({
        where: { branchId: order.branchId, productId: item.productId },
        _sum: { quantity: true },
      });
      const available = aggregate._sum.quantity ?? new Prisma.Decimal(0);
      if (available.lessThan(item.quantity)) throw new Error("INSUFFICIENT_STOCK");
    }

    const subtotal = order.items.reduce(
      (sum, item) => sum.plus(item.unitPrice.mul(item.quantity).minus(item.discount)),
      new Prisma.Decimal(0),
    );
    const vatRate = new Prisma.Decimal(companyConfig.vatRate);
    const vatAmount = subtotal.mul(vatRate).toDecimalPlaces(2);
    const total = subtotal.plus(vatAmount);

    let dueAt: Date | null = null;
    if (input.paymentMethod === "CREDIT") {
      if (!order.customer.creditAllowed || order.customer.creditLimit.lessThanOrEqualTo(0)) {
        throw new Error("CREDIT_NOT_ALLOWED");
      }
      const openInvoices = await tx.invoice.findMany({
        where: {
          customerId: order.customerId,
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          serviceOrder: { branchId: input.branchId },
        },
        include: { payments: { select: { amount: true } } },
      });
      const outstanding = openInvoices.reduce(
        (sum, invoice) => sum.plus(
          invoice.total.minus(invoice.payments.reduce(
            (paid, payment) => paid.plus(payment.amount),
            new Prisma.Decimal(0),
          )),
        ),
        new Prisma.Decimal(0),
      );
      if (outstanding.plus(total).greaterThan(order.customer.creditLimit)) {
        throw new Error("CREDIT_LIMIT_EXCEEDED");
      }
      dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + order.customer.creditDays);
    }

    const financialAccount = input.paymentMethod === "CREDIT"
      ? null
      : await tx.financialAccount.findFirst({
          where: {
            branchId: input.branchId,
            active: true,
            type: input.paymentMethod === "CASH"
              ? "CASH"
              : input.paymentMethod === "CARD"
                ? "POS_CLEARING"
                : "BANK",
          },
          orderBy: { createdAt: "asc" },
        });
    if (input.paymentMethod !== "CREDIT" && !financialAccount) {
      throw new Error("FINANCIAL_ACCOUNT_REQUIRED");
    }

    for (const item of order.items) {
      if (!item.productId || item.product?.category === "SERVICE") continue;
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
        dueAt,
        status: input.paymentMethod === "CREDIT" ? "ISSUED" : "PAID",
        payments: input.paymentMethod === "CREDIT"
          ? undefined
          : {
              create: {
                method: input.paymentMethod,
                amount: total,
                reference: input.paymentReference || null,
                idempotencyKey: input.idempotencyReference,
              },
            },
      },
      include: { coupons: true },
    });

    if (financialAccount) {
      await tx.financialTransaction.create({
        data: {
          branchId: input.branchId,
          accountId: financialAccount.id,
          type: "CUSTOMER_RECEIPT",
          amount: total,
          reference: input.paymentReference || invoice.invoiceNo,
          descriptionAr: `تحصيل فاتورة عميل ${invoice.invoiceNo}`,
          relatedEntityType: "Invoice",
          relatedEntityId: invoice.id,
          performedBy: input.actorId,
          idempotencyKey: `customer-receipt:${input.idempotencyReference}`,
        },
      });
    }

    const grantsWashCoupon = order.items.some((item) => item.product?.grantsWashCoupon);
    let couponSerial: string | null = null;
    if (grantsWashCoupon) {
      couponSerial = `WASH-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + companyConfig.washCouponValidityDays);
      await tx.coupon.create({
        data: {
          serial: couponSerial,
          invoiceId: invoice.id,
          expiresAt,
        },
      });
    }

    await tx.vehicleHistory.create({
      data: {
        vehicleId: order.vehicleId,
        serviceOrderId: order.id,
        odometer: order.odometer,
        summaryAr: "تم إكمال أمر الخدمة وإصدار الفاتورة.",
        nextServiceKm: input.nextServiceKm,
        nextServiceAt: input.nextServiceAt,
      },
    });

    await tx.vehicle.update({
      where: { id: order.vehicleId },
      data: { currentOdometer: order.odometer ?? order.vehicle.currentOdometer },
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
        afterJson: {
          invoiceId: invoice.id,
          total: total.toString(),
          paymentMethod: input.paymentMethod,
          couponSerial,
          nextServiceKm: input.nextServiceKm ?? null,
          nextServiceAt: input.nextServiceAt?.toISOString() ?? null,
        },
      },
    });

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { coupons: true, payments: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
