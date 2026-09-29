import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const rowSchema = z.object({
  sku: z.string().trim().min(2).max(50),
  nameAr: z.string().trim().min(2).max(160),
  category: z.enum(["OIL", "FILTER", "BATTERY", "PART", "WASH_SUPPLY", "SERVICE", "OTHER"]),
  unit: z.string().trim().min(1).max(30),
  salePrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
  minStock: z.coerce.number().min(0).default(0),
  grantsWashCoupon: z.coerce.boolean().default(false),
  openingQty: z.coerce.number().min(0).default(0),
});
const schema = z.object({
  batchId: z.string().trim().min(8).max(120),
  rows: z.array(rowSchema).min(1).max(2000),
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

  const rows = parsed.data.rows.map((row) => ({ ...row, sku: row.sku.toUpperCase() }));
  if (new Set(rows.map((row) => row.sku)).size !== rows.length) {
    return NextResponse.json({ error: "DUPLICATE_SKU_IN_BATCH" }, { status: 409 });
  }
  if (rows.some((row) => row.category === "SERVICE" && row.openingQty !== 0)) {
    return NextResponse.json({ error: "SERVICE_OPENING_STOCK_NOT_ALLOWED" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: session.branchId! }, select: { operationalStatus: true } });
      if (!branch) throw new Error("BRANCH_NOT_FOUND");
      if (branch.operationalStatus !== "PREOPENING") throw new Error("PREOPENING_IMPORT_ONLY");

      let created = 0, updated = 0, openingMovements = 0;
      for (const row of rows) {
        const existing = await tx.product.findUnique({ where: { sku: row.sku } });
        const data = {
          nameAr: row.nameAr, category: row.category, unit: row.unit,
          salePrice: row.salePrice, costPrice: row.costPrice, minStock: row.minStock,
          grantsWashCoupon: row.grantsWashCoupon, active: true,
        };
        const product = existing
          ? await tx.product.update({ where: { id: existing.id }, data })
          : await tx.product.create({ data: { sku: row.sku, ...data } });
        existing ? updated++ : created++;

        if (row.category !== "SERVICE") {
          const reference = `OPENING-STOCK:${row.sku}`;
          await tx.stockMovement.deleteMany({
            where: {
              branchId: session.branchId!,
              productId: product.id,
              type: "RECEIPT",
              OR: [
                { reference },
                { reference: { startsWith: "OPENING-STOCK:", endsWith: `:${row.sku}` } },
              ],
            },
          });
          if (row.openingQty > 0) {
            await tx.stockMovement.create({
              data: {
                branchId: session.branchId!, productId: product.id, type: "RECEIPT",
                quantity: new Prisma.Decimal(row.openingQty), reference, performedBy: session.userId,
              },
            });
            openingMovements++;
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId, action: "PREOPENING_CATALOG_IMPORTED",
          entityType: "Branch", entityId: session.branchId!,
          afterJson: {
            batchId: parsed.data.batchId,
            rowCount: rows.length,
            created,
            updated,
            openingMovements,
            openingStockMode: "REPLACE_PER_SKU_PREOPENING",
          },
        },
      });
      return { rowCount: rows.length, created, updated, openingMovements };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ import: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PREOPENING_CATALOG_IMPORT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "BRANCH_NOT_FOUND" ? 404 : 409 });
  }
}
