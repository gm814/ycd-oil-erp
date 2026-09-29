import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(10_000_000),
  reference: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const product = await db.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product?.active) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const movement = await db.$transaction(async (tx) => {
    const created = await tx.stockMovement.create({
      data: {
        branchId: session.branchId!,
        productId: product.id,
        type: "RECEIPT",
        quantity: parsed.data.quantity,
        reference: parsed.data.reference || null,
        performedBy: session.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "STOCK_RECEIVED",
        entityType: "Product",
        entityId: product.id,
        afterJson: {
          quantity: String(parsed.data.quantity),
          reference: parsed.data.reference || null,
          branchId: session.branchId,
        },
      },
    });

    return created;
  });

  return NextResponse.json({ movement }, { status: 201 });
}
