import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const productSchema = z.object({
  sku: z.string().trim().min(2).max(50).transform(s => s.toUpperCase()),
  nameAr: z.string().trim().min(2).max(160),
  category: z.enum(["OIL", "FILTER", "BATTERY", "PART", "WASH_SUPPLY", "SERVICE", "OTHER"]),
  unit: z.string().trim().min(1).max(30),
  costPrice: z.number().finite().min(0).max(10_000_000),
}).strict();
const schema = z.object({
  format: z.literal("ycd-product-catalog-v1"),
  products: z.array(productSchema).min(1).max(1000),
}).strict().refine(d => new Set(d.products.map(p => p.sku)).size === d.products.length);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE)) {
    return NextResponse.json({ error: "لا تملك صلاحية إدارة المخزون" }, { status: 403 });
  }
  const body = await request.text();
  if (body.length > 1_000_000) return NextResponse.json({ error: "الملف كبير جدًا" }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(body); } catch { return NextResponse.json({ error: "ملف غير صالح" }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "صيغة الملف غير صحيحة أو توجد أكواد مكررة" }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      // Drafts never appear in sale selectors. No stock movements are created.
      const created = await tx.product.createMany({
        data: parsed.data.products.map(p => ({ ...p, salePrice: 0, active: false, serviceIntervalKm: null, grantsWashCoupon: false })),
        skipDuplicates: true,
      });
      const counts = { created: created.count, skipped: parsed.data.products.length - created.count };
      await tx.auditLog.create({ data: {
        actorId: session.userId, action: "PRODUCT_CATALOG_IMPORTED", entityType: "Product",
        afterJson: { ...counts, skus: parsed.data.products.map(p => p.sku), mode: "INACTIVE_CATALOG_ONLY" },
      } });
      return counts;
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "لم يتم الاستيراد. أعد المحاولة؛ لن تتكرر الأصناف الموجودة." }, { status: 409 });
  }
}
