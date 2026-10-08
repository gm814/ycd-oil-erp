import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import AssetActions from "./asset-actions";

const assetStatus: Record<string, string> = {
  ACTIVE: "نشط",
  MAINTENANCE: "تحت الصيانة",
  OUT_OF_SERVICE: "خارج الخدمة",
  DISPOSED: "مستبعد",
};

const maintenanceType: Record<string, string> = {
  PREVENTIVE: "وقائية",
  CORRECTIVE: "تصحيحية",
  INSPECTION: "فحص",
};

export default async function AssetsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const [assets, acquisitions] = await Promise.all([
    db.asset.findMany({
      where: { branchId: session.branchId },
      include: { maintenanceOrders: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: { assetNo: "asc" },
    }),
    db.assetAcquisition.findMany({
      where: { branchId: session.branchId },
      include: { items: { orderBy: [{ itemCode: "asc" }, { nameAr: "asc" }] } },
      orderBy: { invoiceDate: "desc" },
    }),
  ]);
  const setupToolLines = acquisitions.reduce((sum, acquisition) => sum + acquisition.items.length, 0);
  const setupToolUnits = acquisitions.reduce(
    (sum, acquisition) => sum + acquisition.items.reduce((lineSum, item) => lineSum + Number(item.quantity), 0),
    0,
  );
  const setupAcquisitionTotal = acquisitions.reduce((sum, acquisition) => sum + Number(acquisition.total), 0);

  const openOrders = assets.flatMap((asset) =>
    asset.maintenanceOrders
      .filter((order) => order.status === "OPEN" || order.status === "IN_PROGRESS")
      .map((order) => ({ ...order, assetName: asset.nameAr, assetNo: asset.assetNo })),
  );

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>الأصول والصيانة</h1>
          <p>سجل الأصول، الصيانة الوقائية والتصحيحية، التكاليف، ومواعيد الصيانة القادمة.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <AssetActions
        assets={assets.map((asset) => ({ id: asset.id, assetNo: asset.assetNo, nameAr: asset.nameAr, status: asset.status }))}
        openOrders={openOrders.map((order) => ({ id: order.id, workOrderNo: order.workOrderNo, assetName: order.assetName }))}
      />

      <section className="kpis reportKpis">
        <article><span>فواتير تجهيز المركز</span><b>{acquisitions.length}</b></article>
        <article><span>بنود العدد والأدوات</span><b>{setupToolLines}</b></article>
        <article><span>إجمالي الوحدات</span><b>{setupToolUnits}</b></article>
        <article><span>قيمة التجهيزات المسجلة</span><b>{setupAcquisitionTotal.toFixed(2)} ر.س</b></article>
      </section>

      {acquisitions.map((acquisition) => (
        <article className="panel inventoryPanel" key={acquisition.id}>
          <h2>سجل تجهيزات المركز — فاتورة {acquisition.invoiceNo}</h2>
          <p className="muted">
            {acquisition.supplierName} · {acquisition.invoiceDate.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}
            {" · "}المشتري: {acquisition.purchaserName || "—"}
            {" · "}جهة التمويل: {acquisition.fundingCompanyName || "—"}
          </p>
          <div className="kpis reportKpis">
            <article><span>قبل الخصم والضريبة</span><b>{Number(acquisition.subtotal).toFixed(2)} ر.س</b></article>
            <article><span>الخصم</span><b>{Number(acquisition.discount).toFixed(2)} ر.س</b></article>
            <article><span>ضريبة القيمة المضافة</span><b>{Number(acquisition.vatAmount).toFixed(2)} ر.س</b></article>
            <article><span>صافي الفاتورة</span><b>{Number(acquisition.total).toFixed(2)} ر.س</b></article>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الكود</th><th>العدة / الأداة</th><th>الكمية</th><th>سعر الوحدة قبل الضريبة</th><th>الإجمالي قبل الضريبة</th></tr></thead>
              <tbody>
                {acquisition.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.itemCode || "—"}</td>
                    <td>{item.nameAr}</td>
                    <td>{Number(item.quantity).toLocaleString("ar-SA-u-nu-latn")}</td>
                    <td>{Number(item.unitCost).toFixed(2)} ر.س</td>
                    <td>{Number(item.lineSubtotal).toFixed(2)} ر.س</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {acquisition.notes && <p className="formNotice">{acquisition.notes}</p>}
        </article>
      ))}

      <article className="panel inventoryPanel">
        <h2>سجل الأصول</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>رقم الأصل</th><th>الأصل</th><th>الفئة</th><th>الموقع</th><th>الحالة</th><th>الصيانة القادمة</th><th>التكلفة</th></tr></thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.assetNo}</td><td>{asset.nameAr}</td><td>{asset.categoryAr}</td><td>{asset.locationAr || "—"}</td>
                  <td><span className="statusBadge">{assetStatus[asset.status] ?? asset.status}</span></td>
                  <td>{asset.nextMaintenanceAt ? asset.nextMaintenanceAt.toLocaleDateString("ar-SA-u-nu-latn") : "—"}</td>
                  <td>{asset.purchaseCost ? Number(asset.purchaseCost).toFixed(2) + " ر.س" : "—"}</td>
                </tr>
              ))}
              {assets.length === 0 && <tr><td colSpan={7} className="empty">لا توجد أصول مسجلة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel inventoryPanel">
        <h2>أوامر الصيانة المفتوحة</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>أمر الصيانة</th><th>الأصل</th><th>النوع</th><th>البلاغ / العمل</th><th>المسؤول</th><th>التكلفة التقديرية</th></tr></thead>
            <tbody>
              {openOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.workOrderNo}</td><td>{order.assetNo} — {order.assetName}</td>
                  <td>{maintenanceType[order.type] ?? order.type}</td><td>{order.issueAr}</td><td>{order.assignedTo || "—"}</td>
                  <td>{order.estimatedCost ? Number(order.estimatedCost).toFixed(2) + " ر.س" : "—"}</td>
                </tr>
              ))}
              {openOrders.length === 0 && <tr><td colSpan={6} className="empty">لا توجد أوامر صيانة مفتوحة.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
