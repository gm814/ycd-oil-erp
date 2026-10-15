import { nextDocumentNumber } from "@/lib/document-number";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ quoteId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_ORDER)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const purchaseOrder = await db.$transaction(async (tx) => {
      const purchaseRequest = await tx.purchaseRequest.findUnique({
        where: { id },
        include: { order: true },
      });
      if (!purchaseRequest || purchaseRequest.branchId !== session.branchId) throw new Error("PURCHASE_REQUEST_NOT_FOUND");
      if (purchaseRequest.status !== "APPROVED") throw new Error("PURCHASE_REQUEST_NOT_APPROVED");
      if (purchaseRequest.order) throw new Error("PURCHASE_ORDER_ALREADY_EXISTS");

      const quote = await tx.supplierQuote.findUnique({
        where: { id: parsed.data.quoteId },
        include: { items: true },
      });
      if (!quote || quote.purchaseRequestId !== id) throw new Error("SUPPLIER_QUOTE_NOT_FOUND");
      if (quote.items.length === 0) throw new Error("SUPPLIER_QUOTE_EMPTY");

      const subtotal = quote.items.reduce(
        (sum, item) => sum.plus(item.quantity.mul(item.unitCost)),
        new Prisma.Decimal(0),
      );
      const vatRate = new Prisma.Decimal(companyConfig.vatRate);
      const vatAmount = subtotal.mul(vatRate).toDecimalPlaces(2);
      const total = subtotal.plus(vatAmount);

      const orderNo = await nextDocumentNumber(tx);

      const created = await tx.purchaseOrder.create({
        data: {
          orderNo,
          branchId: purchaseRequest.branchId,
          purchaseRequestId: id,
          supplierId: quote.supplierId,
          supplierQuoteId: quote.id,
          status: "APPROVED",
          subtotal,
          vatRate,
          vatAmount,
          total,
          createdBy: session.userId,
          items: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: { items: true, supplier: true },
      });

      await tx.supplierQuote.update({ where: { id: quote.id }, data: { selected: true } });
      await tx.purchaseRequest.update({ where: { id }, data: { status: "ORDERED" } });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "PURCHASE_ORDER_CREATED",
          entityType: "PurchaseOrder",
          entityId: created.id,
          afterJson: { orderNo, supplierId: quote.supplierId, total: total.toString() },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ purchaseOrder }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PURCHASE_ORDER_CREATE_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
