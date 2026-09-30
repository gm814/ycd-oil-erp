import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  descriptionAr: z.string().trim().min(2).max(200),
  productId: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().positive().max(10000),
  unitPrice: z.coerce.number().min(0).max(10_000_000),
  discount: z.coerce.number().min(0).max(10_000_000).default(0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { id } = await params;
  try {
  const item = await db.$transaction(async tx => {
  const order = await tx.serviceOrder.findUnique({ where: { id } });
  if (!order || order.branchId !== session.branchId) {
    throw new Error("NOT_FOUND");
  }
  if (["COMPLETED", "CANCELLED"].includes(order.status)) {
    throw new Error("ORDER_LOCKED");
  }

  if (parsed.data.discount > parsed.data.quantity * parsed.data.unitPrice) throw new Error("INVALID_DISCOUNT");
  const item = await tx.serviceOrderItem.create({
    data: {
      serviceOrderId: order.id,
      productId: parsed.data.productId || null,
      descriptionAr: parsed.data.descriptionAr,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      discount: parsed.data.discount,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: session.userId,
      action: "SERVICE_ORDER_ITEM_ADDED",
      entityType: "ServiceOrder",
      entityId: order.id,
      afterJson: { itemId: item.id, descriptionAr: item.descriptionAr },
    },
  });

  return item;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONCURRENT_CHANGE";
    return NextResponse.json({ error: ["NOT_FOUND","ORDER_LOCKED","INVALID_DISCOUNT"].includes(code) ? code : "CONCURRENT_CHANGE" }, { status: 409 });
  }
}
