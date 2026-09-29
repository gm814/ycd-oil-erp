import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  sku: z.string().trim().min(2).max(50),
  nameAr: z.string().trim().min(2).max(160),
  category: z.enum(["OIL", "FILTER", "BATTERY", "PART", "WASH_SUPPLY", "SERVICE", "OTHER"]),
  unit: z.string().trim().min(1).max(30),
  salePrice: z.coerce.number().min(0).max(10_000_000),
  costPrice: z.coerce.number().min(0).max(10_000_000),
  minStock: z.coerce.number().min(0).max(10_000_000).default(0),
  grantsWashCoupon: z.coerce.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const product = await db.product.create({
      data: {
        ...parsed.data,
        sku: parsed.data.sku.toUpperCase(),
      },
    });

    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product.id,
        afterJson: { sku: product.sku, nameAr: product.nameAr },
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "PRODUCT_CREATE_FAILED" }, { status: 409 });
  }
}
