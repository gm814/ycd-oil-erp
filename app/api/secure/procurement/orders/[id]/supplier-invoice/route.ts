import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  invoiceNo: z.string().trim().min(1).max(80),
  subtotal: z.coerce.number().min(0).max(100_000_000),
  vatAmount: z.coerce.number().min(0).max(100_000_000),
  total: z.coerce.number().min(0).max(100_000_000),
});

function closeEnough(a: Prisma.Decimal, b: Prisma.Decimal) {
  return a.minus(b).abs().lessThanOrEqualTo(new Prisma.Decimal("0.01"));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.SUPPLIER_INVOICE_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const supplierInvoice = await db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: true,
          receipts: { include: { items: true } },
        },
      });
      if (!order || order.branchId !== session.branchId) throw new Error("PURCHASE_ORDER_NOT_FOUND");

      const receivedByItem = new Map<string, Prisma.Decimal>();
      for (const item of order.receipts.flatMap((receipt) => receipt.items)) {
        receivedByItem.set(
          item.purchaseOrderItemId,
          (receivedByItem.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      }
      const quantityMatched = order.items.every((item) =>
        (receivedByItem.get(item.id) ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(item.quantity),
      );
      const subtotal = new Prisma.Decimal(parsed.data.subtotal);
      const vatAmount = new Prisma.Decimal(parsed.data.vatAmount);
      const total = new Prisma.Decimal(parsed.data.total);
      const amountMatched = closeEnough(subtotal, order.subtotal) &&
        closeEnough(vatAmount, order.vatAmount) &&
        closeEnough(total, order.total);
      const threeWayMatched = quantityMatched && amountMatched;

      const created = await tx.supplierInvoice.create({
        data: {
          invoiceNo: parsed.data.invoiceNo,
          supplierId: order.supplierId,
          branchId: order.branchId,
          purchaseOrderId: order.id,
          subtotal,
          vatAmount,
          total,
          status: threeWayMatched ? "MATCHED" : "MISMATCH",
          threeWayMatched,
          matchedAt: threeWayMatched ? new Date() : null,
          createdBy: session.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: threeWayMatched ? "SUPPLIER_INVOICE_MATCHED" : "SUPPLIER_INVOICE_MISMATCH",
          entityType: "SupplierInvoice",
          entityId: created.id,
          afterJson: { purchaseOrderId: order.id, quantityMatched, amountMatched, total: total.toString() },
        },
      });
      return created;
    });

    return NextResponse.json({ supplierInvoice }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPLIER_INVOICE_CREATE_FAILED";
    const duplicate = code.includes("Unique constraint");
    return NextResponse.json({ error: duplicate ? "SUPPLIER_INVOICE_DUPLICATE" : code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
