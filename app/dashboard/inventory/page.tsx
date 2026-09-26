import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
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
    where: { active: true },
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

      {canManage && <InventoryForms products={products.map((p) => ({ id: p.id, sku: p.sku, nameAr: p.nameAr }))} />}

      <article className="panel inventoryPanel">
        <h2>الرصيد الحالي</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SKU</th><th>الصنف</th><th>التصنيف</th><th>الوحدة</th><th>الرصيد</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map(({ product, stock }) => {
                const low = stock <= Number(product.minStock);
                return (
                  <tr key={product.id}>
                    <td>{product.sku}</td>
                    <td>{product.nameAr}</td>
                    <td>{categoryLabels[product.category]}</td>
                    <td>{product.unit}</td>
                    <td>{stock.toLocaleString("ar-SA")}</td>
                    <td>{Number(product.minStock).toLocaleString("ar-SA")}</td>
                    <td><span className={low ? "alertBadge" : "okBadge"}>{low ? "يحتاج متابعة" : "متوفر"}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="empty">لا توجد أصناف معرفة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
