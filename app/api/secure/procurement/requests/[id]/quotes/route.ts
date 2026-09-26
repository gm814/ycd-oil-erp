import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  supplierId: z.string().min(1),
  quoteNo: z.string().trim().max(80).optional(),
  validUntil: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    purchaseRequestItemId: z.string().min(1),
    unitCost: z.coerce.number().min(0).max(10_000_000),
  })).min(1).max(50),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_QUOTE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  const purchaseRequest = await db.purchaseRequest.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!purchaseRequest || purchaseRequest.branchId !== session.branchId) {
    return NextResponse.json({ error: "PURCHASE_REQUEST_NOT_FOUND" }, { status: 404 });
  }
  if (purchaseRequest.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "PURCHASE_REQUEST_NOT_OPEN_FOR_QUOTES" }, { status: 409 });
  }

  const supplier = await db.supplier.findUnique({ where: { id: parsed.data.supplierId } });
  if (!supplier?.active) return NextResponse.json({ error: "SUPPLIER_NOT_FOUND" }, { status: 404 });

  const requestItemIds = new Set(purchaseRequest.items.map((item) => item.id));
  const quotedIds = parsed.data.items.map((item) => item.purchaseRequestItemId);
  if (new Set(quotedIds).size !== purchaseRequest.items.length || quotedIds.some((id) => !requestItemIds.has(id))) {
    return NextResponse.json({ error: "QUOTE_MUST_COVER_ALL_REQUEST_ITEMS" }, { status: 400 });
  }

  const pricing = new Map(parsed.data.items.map((item) => [item.purchaseRequestItemId, new Prisma.Decimal(item.unitCost)]));
  const totalAmount = purchaseRequest.items.reduce(
    (sum, item) => sum.plus(item.quantity.mul(pricing.get(item.id)!)),
    new Prisma.Decimal(0),
  );

  const quote = await db.supplierQuote.create({
    data: {
      purchaseRequestId: purchaseRequest.id,
      supplierId: supplier.id,
      quoteNo: parsed.data.quoteNo || null,
      totalAmount,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
      notes: parsed.data.notes || null,
      items: {
        create: purchaseRequest.items.map((item) => ({
          purchaseRequestItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: pricing.get(item.id)!,
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  await db.auditLog.create({
    data: {
      actorId: session.userId,
      action: "SUPPLIER_QUOTE_ADDED",
      entityType: "SupplierQuote",
      entityId: quote.id,
      afterJson: { requestId: purchaseRequest.id, supplierId: supplier.id, totalAmount: totalAmount.toString() },
    },
  });

  return NextResponse.json({ quote }, { status: 201 });
}
