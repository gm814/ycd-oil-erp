import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  reason: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive().max(1_000_000),
    notes: z.string().trim().max(300).optional(),
  })).min(1).max(50),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_REQUEST)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
  const products = await db.product.count({ where: { id: { in: productIds }, active: true } });
  if (products !== productIds.length) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const requestNo = `PR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const purchaseRequest = await db.$transaction(async (tx) => {
    const created = await tx.purchaseRequest.create({
      data: {
        requestNo,
        branchId: session.branchId!,
        requestedBy: session.userId,
        reason: parsed.data.reason || null,
        status: "PENDING_APPROVAL",
        items: {
          create: parsed.data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "PURCHASE_REQUEST_CREATED",
        entityType: "PurchaseRequest",
        entityId: created.id,
        afterJson: { requestNo, itemCount: created.items.length, branchId: session.branchId },
      },
    });
    return created;
  });

  return NextResponse.json({ purchaseRequest }, { status: 201 });
}
