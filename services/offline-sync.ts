import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/rbac";
import type { OfflineCommand } from "@/lib/offline/contracts";
import { completeServiceOrderInTransaction } from "@/services/service-order";

export async function syncOfflineCommand(command: OfflineCommand, session: SessionPayload) {
  if (command.userId !== session.userId || command.branchId !== session.branchId) throw new Error("SCOPE_CHANGED");
  if (session.mustChangePassword || command.sessionVersion !== session.sessionVersion) throw new Error("SESSION_CHANGED");
  const required: string[] = [PERMISSIONS.SERVICE_ORDER_CREATE];
  if (command.payload.complete) required.push(PERMISSIONS.INVENTORY_ISSUE, PERMISSIONS.INVOICE_ISSUE,
    command.payload.paymentMethod === "CREDIT" ? PERMISSIONS.CREDIT_SALE : PERMISSIONS.PAYMENT_RECEIVE);
  if (!required.every(permission => session.permissions.includes(permission))) throw new Error("FORBIDDEN");

  const payloadHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  // Serializable retries handle two tabs/devices submitting the same UUID concurrently.
  // Receipt + customer + vehicle + order + invoice + stock + payment share ONE commit.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const receipt = await tx.offlineReceipt.findUnique({ where: { id: command.id } });
        if (receipt) {
          if (receipt.userId !== session.userId || receipt.branchId !== session.branchId || receipt.payloadHash !== payloadHash) throw new Error("IDEMPOTENCY_CONFLICT");
          return receipt.result;
        }
        const shift = await tx.shift.findUnique({ where: { id: command.shiftId } });
        if (!shift || shift.branchId !== session.branchId || shift.closedAt) throw new Error("SHIFT_CHANGED");
        const data = command.payload;
        let customer = data.phone ? await tx.customer.findFirst({ where: { phone: data.phone } }) : null;
        if (customer && customer.name !== data.customerName) throw new Error("CUSTOMER_CONFLICT");
        if (!customer) customer = await tx.customer.create({ data: { name: data.customerName, phone: data.phone || null } });
        const plate = data.plate.replace(/\s+/g, " ").toUpperCase();
        let vehicle = await tx.vehicle.findFirst({ where: { plate } });
        const odometer = data.odometer as number | undefined;
        if (vehicle && (vehicle.customerId !== customer.id || (odometer !== undefined && odometer < (vehicle.currentOdometer ?? 0)))) throw new Error("VEHICLE_CONFLICT");
        if (!vehicle) vehicle = await tx.vehicle.create({ data: {
          customerId: customer.id, plate, make: data.make || null, model: data.model || null,
          year: data.year as number | undefined, currentOdometer: odometer,
        } });
        const items = [];
        for (const line of data.items) {
          const product = await tx.product.findUnique({ where: { id: line.productId } });
          if (!product?.active || !product.salePrice.equals(line.unitPrice)) throw new Error("PRODUCT_CHANGED");
          items.push({ productId: product.id, descriptionAr: product.nameAr, quantity: line.quantity, unitPrice: product.salePrice });
        }
        const order = await tx.serviceOrder.create({ data: {
          orderNo: `SO-OFF-${command.id.toUpperCase()}`, branchId: command.branchId,
          shiftId: shift.id, customerId: customer.id, vehicleId: vehicle.id, odometer,
          status: "OPEN", items: { create: items },
        } });
        const invoice = data.complete ? await completeServiceOrderInTransaction(tx, {
          serviceOrderId: order.id, branchId: command.branchId, actorId: session.userId,
          paymentMethod: data.paymentMethod, paymentReference: data.paymentReference || undefined,
          idempotencyReference: `offline:${command.id}`,
        }) : null;
        const result = { orderId: order.id, orderNo: order.orderNo, invoiceId: invoice?.id ?? null, invoiceNo: invoice?.invoiceNo ?? null };
        await tx.auditLog.create({ data: {
          actorId: session.userId, action: "OFFLINE_ORDER_SYNCHRONIZED", entityType: "ServiceOrder", entityId: order.id,
          afterJson: { operationId: command.id, recordedAt: command.recordedAt, shiftId: shift.id, ...result },
        } });
        await tx.offlineReceipt.create({ data: {
          id: command.id, userId: session.userId, branchId: command.branchId, payloadHash,
          recordedAt: new Date(command.recordedAt), result,
        } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("SYNC_RETRY");
}
