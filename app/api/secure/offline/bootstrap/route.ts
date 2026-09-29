import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { PERMISSIONS } from "@/lib/rbac";

export async function GET() {
  if (process.env.YCD_OFFLINE_PILOT !== "true") return NextResponse.json({ error: "OFFLINE_NOT_ENABLED" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId || !session.permissions.includes(PERMISSIONS.SERVICE_ORDER_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const [shift, products, stock] = await Promise.all([
    db.shift.findFirst({ where: { branchId: session.branchId, closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true } }),
    db.product.findMany({ where: { active: true }, select: { id: true, sku: true, nameAr: true, category: true, unit: true, salePrice: true }, orderBy: { nameAr: "asc" } }),
    db.stockMovement.groupBy({ by: ["productId"], where: { branchId: session.branchId }, _sum: { quantity: true } }),
  ]);
  const balances = new Map(stock.map(row => [row.productId, Number(row._sum.quantity ?? 0)]));
  return NextResponse.json({
    version: 1, userId: session.userId, branchId: session.branchId,
    sessionVersion: session.sessionVersion, name: session.name, permissions: session.permissions,
    shiftId: shift?.id ?? null, preparedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    vatRate: companyConfig.vatRate,
    products: products.map(product => ({ ...product, salePrice: Number(product.salePrice), stock: balances.get(product.id) ?? 0 })),
  }, { headers: { "cache-control": "private, no-store" } });
}
