import { nextDocumentNumber } from "@/lib/document-number";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  supplierDeliveryRef: z.string().trim().max(100).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().min(1),
    quantity: z.coerce.number().positive().max(1_000_000),
  })).min(1).max(50),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_RECEIVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const receipt = await db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: true,
          receipts: { include: { items: true } },
        },
      });
      if (!order || order.branchId !== session.branchId) throw new Error("PURCHASE_ORDER_NOT_FOUND");
      if (order.status === "CANCELLED" || order.status === "RECEIVED") throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");

      const orderItems = new Map(order.items.map((item) => [item.id, item]));
      const requested = new Map<string, Prisma.Decimal>();
      for (const input of parsed.data.items) {
        if (!orderItems.has(input.purchaseOrderItemId)) throw new Error("PURCHASE_ORDER_ITEM_NOT_FOUND");
        if (requested.has(input.purchaseOrderItemId)) throw new Error("DUPLICATE_RECEIPT_ITEM");
        requested.set(input.purchaseOrderItemId, new Prisma.Decimal(input.quantity));
      }

      for (const [itemId, quantity] of requested) {
        const ordered = orderItems.get(itemId)!;
        const alreadyReceived = order.receipts
          .flatMap((existing) => existing.items)
          .filter((item) => item.purchaseOrderItemId === itemId)
          .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));
        if (alreadyReceived.plus(quantity).greaterThan(ordered.quantity)) throw new Error("RECEIPT_EXCEEDS_ORDERED_QUANTITY");
      }

      const receiptNo = await nextDocumentNumber(tx);
      const created = await tx.goodsReceipt.create({
        data: {
          receiptNo,
          branchId: order.branchId,
          purchaseOrderId: order.id,
          receivedBy: session.userId,
          supplierDeliveryRef: parsed.data.supplierDeliveryRef || null,
          items: {
            create: [...requested.entries()].map(([itemId, quantity]) => ({
              purchaseOrderItemId: itemId,
              productId: orderItems.get(itemId)!.productId,
              quantity,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of created.items) {
        await tx.stockMovement.create({
          data: {
            branchId: order.branchId,
            productId: item.productId,
            type: "RECEIPT",
            quantity: item.quantity,
            reference: receiptNo,
            performedBy: session.userId,
          },
        });
      }

      const priorByItem = new Map<string, Prisma.Decimal>();
      for (const existing of order.receipts.flatMap((entry) => entry.items)) {
        priorByItem.set(
          existing.purchaseOrderItemId,
          (priorByItem.get(existing.purchaseOrderItemId) ?? new Prisma.Decimal(0)).plus(existing.quantity),
        );
      }
      for (const item of created.items) {
        priorByItem.set(
          item.purchaseOrderItemId,
          (priorByItem.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      }
      const fullyReceived = order.items.every((item) =>
        (priorByItem.get(item.id) ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(item.quantity),
      );

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "GOODS_RECEIPT_POSTED",
          entityType: "GoodsReceipt",
          entityId: created.id,
          afterJson: { receiptNo, purchaseOrderId: order.id, itemCount: created.items.length },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GOODS_RECEIPT_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
