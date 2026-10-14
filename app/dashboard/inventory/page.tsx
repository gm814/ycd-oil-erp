import OpeningStockImport from "./opening-stock-import";
import { productPriceRange } from "@/lib/product-pricing";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import CatalogImport from "./catalog-import";
import InventoryForms from "./inventory-forms";

const categoryLabels: Record<string, string> = {
  OIL: "زيوت",
  FILTER: "فلاتر",
  BATTERY: "بطاريات",
  PART: "قطع غيار",
  WASH_SUPPLY: "مواد مغسلة",
  SERVICE: "خدمة",
  OTHER: "أخرى",
};

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const canManage = hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE);
  const products = await db.product.findMany({
    where: canManage ? {} : { active: true },
    include: {
      stockMovements: {
        where: { branchId: session.branchId },
        select: { quantity: true },
      },
    },
    orderBy: { nameAr: "asc" },
  });

  const rows = products.map((product) => {
    const stock = product.stockMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    return { product, stock };
  });

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المخزون والزيوت والفلاتر</h1>
          <p>تعريف الأصناف، استلام الكميات، ومراقبة الرصيد والحد الأدنى.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      {canManage && products.some(p => p.costBasedPricing) && <article className="panel">
        <h2>تسعير الأصناف حسب التكلفة</h2>
        <p>عدد الأصناف المسعرة: {products.filter(p => p.costBasedPricing).length}. سعر البيع الافتراضي عند الحد الأدنى: التكلفة × 1.25. الحد الأعلى: التكلفة × 6. الحدود قبل الضريبة وتشمل صافي البيع بعد الخصم.</p>
        <p>الزيوت: {products.filter(p => p.costBasedPricing && p.category === "OIL" && p.serviceIntervalKm === 5000).length} صنفًا بفترة 5,000 كم، و{products.filter(p => p.costBasedPricing && p.category === "OIL" && p.serviceIntervalKm === 10000).length} بفترة 10,000 كم، و{products.filter(p => p.costBasedPricing && p.category === "OIL" && !p.serviceIntervalKm).length} بانتظار تحديد الفترة.</p>
      </article>}
      {canManage && <OpeningStockImport />}
      {canManage && <CatalogImport />}
      {canManage && <InventoryForms products={products.map((p) => ({ id: p.id, sku: p.sku, nameAr: p.nameAr, category: p.category, serviceIntervalKm: p.serviceIntervalKm }))} />}

      <article className="panel inventoryPanel">
        <h2>الرصيد الحالي</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SKU</th><th>الصنف</th><th>التصنيف</th><th>الوحدة</th>{canManage && <th>التكلفة</th>}<th>سعر البيع</th><th>نطاق البيع قبل الضريبة</th><th>فترة الزيت</th><th>الرصيد</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map(({ product, stock }) => {
                const low = stock <= Number(product.minStock);
                return (
                  <tr key={product.id}>
                    <td>{product.sku}</td>
                    <td>{product.nameAr}</td>
                    <td>{categoryLabels[product.category]}</td>
                    <td>{product.unit}</td>
                    {canManage && <td>{Number(product.costPrice).toFixed(2)}</td>}
                    <td>{Number(product.salePrice).toFixed(2)}</td>
                    <td>{product.costBasedPricing ? `${productPriceRange(product)!.min.toFixed(2)}–${productPriceRange(product)!.max.toFixed(2)}` : "—"}</td>
                    <td>{product.serviceIntervalKm ? `${product.serviceIntervalKm} كم` : "غير محددة"}</td>
                    <td>{stock.toLocaleString("ar-SA-u-nu-latn")}</td>
                    <td>{Number(product.minStock).toLocaleString("ar-SA-u-nu-latn")}</td>
                    <td><span className={low ? "alertBadge" : "okBadge"}>{!product.active ? "غير نشط — بانتظار المراجعة والتسعير" : low ? "يحتاج متابعة" : "متوفر"}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={canManage ? 11 : 10} className="empty">لا توجد أصناف معرفة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
