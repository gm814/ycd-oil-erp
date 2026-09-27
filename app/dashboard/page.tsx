import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { riyadhBusinessDayRange } from "@/lib/time";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import LogoutButton from "./logout-button";

const modules = [
  { label: "جاهزية الافتتاح والتشغيل", href: "/dashboard/readiness", any: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.OPERATIONS_UAT, PERMISSIONS.OPERATIONS_GO_LIVE] },
  { label: "مركز الاعتمادات والتنبيهات", href: "/dashboard/approvals", any: [PERMISSIONS.PROCUREMENT_APPROVE, PERMISSIONS.SUPPLIER_INVOICE_APPROVE_PAYMENT, PERMISSIONS.FINANCE_EXPENSE_APPROVE, PERMISSIONS.SHIFT_VARIANCE_APPROVE, PERMISSIONS.BANK_RECONCILE_REVIEW, PERMISSIONS.FINANCIAL_CLOSE_REVIEW, PERMISSIONS.CUSTODY_APPROVE, PERMISSIONS.PAYROLL_APPROVE, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.AUDIT_VIEW] },
  { label: "الورديات والإقفال اليومي", href: "/dashboard/shifts", any: [PERMISSIONS.SHIFT_OPEN, PERMISSIONS.SHIFT_CLOSE, PERMISSIONS.SHIFT_VARIANCE_APPROVE] },
  { label: "استقبال السيارات وأوامر الخدمة", href: "/dashboard/service-orders", any: [PERMISSIONS.SERVICE_ORDER_CREATE, PERMISSIONS.SERVICE_ORDER_APPROVE] },
  { label: "الزيوت وخدمات السيارات", href: "/dashboard/service-orders", any: [PERMISSIONS.SERVICE_ORDER_CREATE, PERMISSIONS.SERVICE_ORDER_APPROVE] },
  { label: "كوبونات المغسلة", href: "/dashboard/coupons", any: [PERMISSIONS.COUPON_REDEEM] },
  { label: "المبيعات والعملاء", href: "/dashboard/customers", any: [PERMISSIONS.CUSTOMER_VIEW, PERMISSIONS.PAYMENT_RECEIVE, PERMISSIONS.INVOICE_ISSUE] },
  { label: "المشتريات والتوريد", href: "/dashboard/procurement", any: [PERMISSIONS.PROCUREMENT_REQUEST, PERMISSIONS.PROCUREMENT_QUOTE, PERMISSIONS.PROCUREMENT_APPROVE, PERMISSIONS.PROCUREMENT_ORDER, PERMISSIONS.PROCUREMENT_RECEIVE] },
  { label: "المخزون والزيوت والفلاتر", href: "/dashboard/inventory", any: [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_ISSUE] },
  { label: "المالية والبنوك", href: "/dashboard/finance", any: [PERMISSIONS.FINANCE_VIEW] },
  { label: "العهد", href: "/dashboard/custody", any: [PERMISSIONS.CUSTODY_REQUEST, PERMISSIONS.CUSTODY_APPROVE, PERMISSIONS.CUSTODY_DISBURSE, PERMISSIONS.CUSTODY_SETTLE, PERMISSIONS.CUSTODY_CLOSE] },
  { label: "الموظفون والرواتب", href: "/dashboard/hr", any: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE, PERMISSIONS.PAYROLL_PREPARE, PERMISSIONS.PAYROLL_APPROVE, PERMISSIONS.PAYROLL_PAY] },
  { label: "الهيكل التشغيلي والمسؤوليات", href: "/dashboard/team", any: [PERMISSIONS.DASHBOARD_VIEW] },
  { label: "الأصول والصيانة", href: "/dashboard/assets", any: [PERMISSIONS.ASSET_VIEW, PERMISSIONS.ASSET_MANAGE, PERMISSIONS.MAINTENANCE_MANAGE] },
  { label: "التقارير والرقابة", href: "/dashboard/reports", any: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.AUDIT_VIEW] },
  { label: "المستندات والنماذج", href: "/dashboard/documents", any: [PERMISSIONS.DASHBOARD_VIEW] },
] as const;

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/");

  const { start, end } = riyadhBusinessDayRange();

  const [branchState, invoices, serviceOrderCount, openShift, activeCoupons, products, pendingPurchases, invoiceMismatches, openCustodies, draftPayrolls, maintenanceAlerts, pendingShiftVariances, pendingFinancialCloses] = await Promise.all([
    db.branch.findUnique({
      where: { id: session.branchId },
      select: { operationalStatus: true },
    }),
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

  if (!branchState) redirect("/");
  const phaseLabel = branchState.operationalStatus === "LIVE"
    ? "التشغيل التجاري"
    : branchState.operationalStatus === "SUSPENDED"
      ? "موقوف تشغيليًا"
      : companyConfig.operationalPhaseAr;

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
          <img className="sidebarBrandLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
          <small>ERP & Operations</small>
        </div>
        <nav>
          <strong>لوحة التحكم</strong>
          {modules
            .filter((module) => module.any.some((permission) => hasPermission(session.permissions, permission)))
            .map((module) => <a href={module.href} key={module.label}>{module.label}</a>)}
          {hasPermission(session.permissions, PERMISSIONS.USER_MANAGE) && (
            <a href="/dashboard/admin/users">المستخدمون والصلاحيات</a>
          )}
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
            <a className="secondaryLink" href="/dashboard/account/security">أمان الحساب</a>
            <LogoutButton />
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">YCD OIL ERP & Operations</span>
            <h2>تشغيل منظم، رقابة لحظية، وقرار مبني على البيانات.</h2>
            <p>الواجهة التشغيلية للفرع الأول – الرياض - حي طويق.</p>
            <p><span className={branchState.operationalStatus === "LIVE" ? "okBadge" : "alertBadge"}>{phaseLabel}</span></p>
          </div>
          <a className="primaryLink" href="/dashboard/readiness">متابعة جاهزية الافتتاح</a>
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
            <div className="actionStack">
              <a className="orderLink" href="/dashboard/approvals">فتح مركز الاعتمادات والتنبيهات</a>
              <a className="orderLink" href="/dashboard/finance/closes">فتح مركز الإقفال المالي</a>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
