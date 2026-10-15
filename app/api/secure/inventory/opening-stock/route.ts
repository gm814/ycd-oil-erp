import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  format: z.literal("ycd-opening-stock-v1"),
  sourceDate: z.iso.date(),
  rows: z.array(z.object({
    sku: z.string().trim().min(2).max(50).transform(s => s.toUpperCase()),
    quantity: z.number().finite().positive().max(10_000_000).refine(n => new Prisma.Decimal(n).decimalPlaces() <= 3),
  }).strict()).min(1).max(2000),
}).strict().refine(d => new Set(d.rows.map(r => r.sku)).size === d.rows.length);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
  if (!session.branchId || !hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE)) return NextResponse.json({ error: "يلزم حساب إدارة المخزون مرتبط بالفرع" }, { status: 403 });
  const text = await request.text();
  if (text.length > 1_000_000) return NextResponse.json({ error: "الملف كبير جدًا" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "ملف غير صالح" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "راجع صيغة الملف والكميات والأكواد المكررة" }, { status: 400 });
  const data = parsed.data;
  try {
    const result = await db.$transaction(async tx => {
      const products = await tx.product.findMany({ where: { sku: { in: data.rows.map(r => r.sku) } } });
      if (products.length !== data.rows.length || products.some(p => !p.active || p.category === "SERVICE")) throw new Error("يجب تعريف الأصناف وتفعيلها أولًا، ولا يُقبل رصيد لخدمة");
      const bySku = new Map(products.map(p => [p.sku, p]));
      const previous = await tx.stockMovement.findMany({ where: {
        branchId: session.branchId!, productId: { in: products.map(p => p.id) }, type: "RECEIPT",
        reference: { startsWith: "OPENING-STOCK:" },
      } });
      const additions: Prisma.StockMovementCreateManyInput[] = [];
      let skipped = 0;
      for (const row of data.rows) {
        const product = bySku.get(row.sku)!;
        // Stable across file names, row ordering and dates. Concurrent requests
        // cannot create a second opening balance for the same branch/product.
        const id = "opening-" + createHash("sha256").update(JSON.stringify([session.branchId, product.id])).digest("hex");
        const reference = `OPENING-STOCK:${data.sourceDate}:${row.sku}`;
        const existing = previous.filter(m => m.productId === product.id);
        if (existing.length) {
          if (existing.length !== 1 || existing[0].id !== id || existing[0].reference !== reference || !existing[0].quantity.equals(row.quantity)) throw new Error(`يوجد رصيد افتتاحي مختلف للصنف ${row.sku}؛ يلزم تسوية مستقلة`);
          skipped++; continue;
        }
        additions.push({ id, branchId: session.branchId!, productId: product.id, type: "RECEIPT", quantity: row.quantity, reference, performedBy: session.userId });
      }
      if (additions.length) {
        await tx.stockMovement.createMany({ data: additions });
        await tx.auditLog.create({ data: {
          actorId: session.userId, action: "PROVISIONAL_OPENING_STOCK_IMPORTED", entityType: "Branch", entityId: session.branchId!,
          afterJson: { sourceDate: data.sourceDate, mode: "PROVISIONAL_PENDING_SALES_RECONCILIATION", rows: data.rows, created: additions.length, skipped },
        } });
      }
      const quantity = additions.reduce((sum, row) => sum.plus(String(row.quantity)), new Prisma.Decimal(0));
      return { created: additions.length, skipped, quantity: quantity.toString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError ? "تزامنت عملية أخرى؛ أعد رفع الملف. لن يُكرر الرصيد." : error instanceof Error ? error.message : "تعذر حفظ الأرصدة";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
