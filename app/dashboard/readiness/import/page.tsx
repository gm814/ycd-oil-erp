import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import PreopeningImportClient from "./preopening-import-client";

export default async function PreopeningImportPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const canCatalog = hasPermission(session.permissions, PERMISSIONS.INVENTORY_MANAGE);
  const canSuppliers = hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_QUOTE);
  if (!canCatalog && !canSuppliers) redirect("/dashboard/readiness");

  const [branch, products, suppliers, stockMovements] = await Promise.all([
    db.branch.findUnique({ where: { id: session.branchId }, select: { operationalStatus: true } }),
    db.product.count({ where: { active: true } }),
    db.supplier.count({ where: { active: true } }),
    db.stockMovement.count({ where: { branchId: session.branchId, quantity: { gt: 0 } } }),
  ]);
  if (!branch) redirect("/dashboard");

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/readiness" className="backLink">← جاهزية الافتتاح</a>
          <h1>مركز استيراد بيانات ما قبل التشغيل</h1>
          <p>مخصص لاستلام ملفات المحاسب وتحميل الأصناف والخدمات والجرد الافتتاحي والموردين قبل تشغيل فرع طويق.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>مرحلة الفرع</span><b>{branch.operationalStatus === "PREOPENING" ? "ما قبل التشغيل" : branch.operationalStatus}</b></article>
        <article><span>الأصناف والخدمات</span><b>{products}</b></article>
        <article><span>حركات الرصيد الافتتاحي</span><b>{stockMovements}</b></article>
        <article><span>الموردون</span><b>{suppliers}</b></article>
      </section>

      {branch.operationalStatus !== "PREOPENING" ? (
        <article className="panel"><p className="alertBadge">الاستيراد الافتتاحي مقفل بعد بدء التشغيل التجاري.</p></article>
      ) : (
        <PreopeningImportClient canCatalog={canCatalog} canSuppliers={canSuppliers} />
      )}

      <article className="panel">
        <h2>بيانات ما زالت بانتظار التزويد</h2>
        <p>قائمة العدد والأدوات والأصول الكاملة ستُستكمل عند وصول كشف المحاسب، وكذلك بيانات السجل والحسابات البنكية للشركة الرئيسية وباقي شركات المجموعة. لن ينشئ النظام بيانات تقديرية بدل المستندات الفعلية.</p>
      </article>
    </main>
  );
}
