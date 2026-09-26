import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { riyadhBusinessDayRange } from "@/lib/time";
import LogoutButton from "./logout-button";

const modules = [
  ["الورديات والإقفال اليومي", "/dashboard/shifts"],
  ["استقبال السيارات وأوامر الخدمة", "/dashboard/service-orders"],
  ["الزيوت وخدمات السيارات", "/dashboard/service-orders"],
  ["كوبونات المغسلة", "/dashboard/coupons"],
  ["المبيعات والعملاء", "/dashboard/customers"],
  ["المشتريات والتوريد", "/dashboard/procurement"],
  ["المخزون والزيوت والفلاتر", "/dashboard/inventory"],
  ["المالية والبنوك", "/dashboard/finance"],
  ["العهد", "/dashboard/custody"],
  ["الموظفون والرواتب", "/dashboard/hr"],
  ["الأصول والصيانة", "/dashboard/assets"],
  ["التقارير والرقابة", "/dashboard/reports"],
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/");

  const { start, end } = riyadhBusinessDayRange();

  const [invoices, serviceOrderCount, openShift, activeCoupons, products, pendingPurchases, invoiceMismatches, openCustodies, draftPayrolls, maintenanceAlerts, pendingShiftVariances, pendingFinancialCloses] = await Promise.all([
    db.invoice.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: { not: "VOID" },
        serviceOrder: { branchId: session.branchId },
      },
      include: { payments: true },
    }),
    db.serviceOrder.count({
      where: { branchId: session.branchId, createdAt: { gte: start, lt: end } },
    }),
    db.shift.findFirst({
      where: { branchId: session.branchId, closedAt: null },
      orderBy: { openedAt: "desc" },
    }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        invoice: { serviceOrder: { branchId: session.branchId } },
      },
    }),
    db.product.findMany({
      where: { active: true },
      select: {
        minStock: true,
        stockMovements: {
          where: { branchId: session.branchId },
          select: { quantity: true },
        },
      },
    }),
    db.purchaseRequest.count({
      where: { branchId: session.branchId, status: "PENDING_APPROVAL" },
    }),
    db.supplierInvoice.count({
      where: { branchId: session.branchId, status: "MISMATCH" },
    }),
    db.custodyRequest.count({
      where: {
        branchId: session.branchId,
        status: { in: ["REQUESTED", "APPROVED", "DISBURSED", "PARTIALLY_SETTLED", "SETTLED"] },
      },
    }),
    db.payrollPeriod.count({
      where: { branchId: session.branchId, status: { in: ["DRAFT", "APPROVED"] } },
    }),
    db.asset.count({
      where: {
        branchId: session.branchId,
        status: { not: "DISPOSED" },
        OR: [
          { status: "MAINTENANCE" },
          { nextMaintenanceAt: { lte: new Date() } },
        ],
      },
    }),
    db.shiftVarianceResolution.count({
      where: { branchId: session.branchId, status: "PENDING" },
    }),
    db.financialClose.count({
      where: { branchId: session.branchId, status: { in: ["DRAFT", "REVIEWED"] } },
    }),
  ]);

  const salesToday = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const cashToday = invoices.flatMap((invoice) => invoice.payments)
    .filter((payment) => payment.method === "CASH")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const lowStockCount = products.filter((product) => {
    const stock = product.stockMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    return stock <= Number(product.minStock);
  }).length;

  const kpis = [
    ["المبيعات اليوم", `${salesToday.toFixed(2)} ر.س`],
    ["السيارات المستلمة", serviceOrderCount.toLocaleString("ar-SA")],
    ["التحصيل النقدي", `${cashToday.toFixed(2)} ر.س`],
    ["كوبونات فعالة", activeCoupons.toLocaleString("ar-SA")],
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logoPlaceholder">YCD <span>OIL</span></div>
          <small>ERP & Operations</small>
        </div>
        <nav>
          <strong>لوحة التحكم</strong>
          {modules.map(([item, href]) => <a href={href} key={item}>{item}</a>)}
        </nav>
      </aside>

      <section className="content">
        <header>
          <div>
            <h1>لوحة الإدارة العامة</h1>
            <p>{companyConfig.legalNameAr}</p>
          </div>
          <div className="userbar">
            <div className="branch">{session.name} · {companyConfig.branch}</div>
            <LogoutButton />
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">YCD OIL ERP & Operations</span>
            <h2>تشغيل منظم، رقابة لحظية، وقرار مبني على البيانات.</h2>
            <p>الواجهة التشغيلية للفرع الأول – الرياض - حي طويق.</p>
          </div>
          <a className="primaryLink" href="/dashboard/shifts">{openShift ? "متابعة الوردية" : "فتح وردية جديدة"}</a>
        </section>

        <section className="kpis">
          {kpis.map(([label, value]) => (
            <article key={label}><span>{label}</span><b>{value}</b></article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <h3>حالة التشغيل</h3>
            <p><span className={openShift ? "okBadge" : "alertBadge"}>{openShift ? "الوردية مفتوحة" : "لا توجد وردية مفتوحة"}</span></p>
            <p>أوامر الخدمة اليوم: <b>{serviceOrderCount.toLocaleString("ar-SA")}</b></p>
          </article>
          <article className="panel">
            <h3>تنبيهات الإدارة</h3>
            <p>مخزون عند الحد الأدنى: <b>{lowStockCount.toLocaleString("ar-SA")}</b></p>
            <p>طلبات شراء تنتظر الاعتماد: <b>{pendingPurchases.toLocaleString("ar-SA")}</b></p>
            <p className={invoiceMismatches > 0 ? "" : "empty"}>فواتير موردين غير متطابقة: <b>{invoiceMismatches.toLocaleString("ar-SA")}</b></p>
            <p className={openCustodies > 0 ? "" : "empty"}>عهد غير مقفلة: <b>{openCustodies.toLocaleString("ar-SA")}</b></p>
            <p className={draftPayrolls > 0 ? "" : "empty"}>مسيرات رواتب تنتظر الاعتماد/الصرف: <b>{draftPayrolls.toLocaleString("ar-SA")}</b></p>
            <p className={maintenanceAlerts > 0 ? "" : "empty"}>أصول تحتاج متابعة صيانة: <b>{maintenanceAlerts.toLocaleString("ar-SA")}</b></p>
            <p className={pendingShiftVariances > 0 ? "" : "empty"}>فروقات ورديات تنتظر الاعتماد: <b>{pendingShiftVariances.toLocaleString("ar-SA")}</b></p>
            <p className={pendingFinancialCloses > 0 ? "" : "empty"}>إقفالات مالية تنتظر المراجعة/الإقفال: <b>{pendingFinancialCloses.toLocaleString("ar-SA")}</b></p>
            <a className="orderLink" href="/dashboard/finance/closes">فتح مركز الإقفال المالي</a>
          </article>
        </section>
      </section>
    </main>
  );
}
