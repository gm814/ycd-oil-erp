import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import GoLiveControl from "./go-live-control";

function statusBadge(done: boolean) {
  return <span className={done ? "okBadge" : "alertBadge"}>{done ? "مكتمل" : "مطلوب"}</span>;
}

export default async function ReadinessPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const [
    branchState,
    employees,
    activeUsers,
    bankAccounts,
    openingBankBalance,
    parentCompanies,
    groupFunding,
    activeProducts,
    serviceProducts,
    physicalProducts,
    openingStockMovements,
    suppliers,
    shifts,
    serviceOrders,
  ] = await Promise.all([
    db.branch.findUnique({
      where: { id: session.branchId },
      select: { operationalStatus: true, goLiveAt: true },
    }),
    db.employee.count({ where: { branchId: session.branchId, active: true } }),
    db.user.count({ where: { branchId: session.branchId, status: "ACTIVE", employeeId: { not: null } } }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId, active: true, type: "BANK" },
      select: { id: true, nameAr: true, bankName: true, accountNumber: true, iban: true },
    }),
    db.financialTransaction.aggregate({
      where: {
        branchId: session.branchId,
        type: "OPENING_BALANCE",
        account: { type: "BANK" },
      },
      _sum: { amount: true },
    }),
    db.groupCompany.count({ where: { organization: { branches: { some: { id: session.branchId } } }, relationType: "PARENT", active: true } }),
    db.groupFunding.aggregate({ where: { branchId: session.branchId }, _sum: { amount: true }, _count: true }),
    db.product.count({ where: { active: true } }),
    db.product.count({ where: { active: true, category: "SERVICE" } }),
    db.product.count({ where: { active: true, category: { not: "SERVICE" } } }),
    db.stockMovement.count({ where: { branchId: session.branchId, quantity: { gt: 0 } } }),
    db.supplier.count({ where: { active: true } }),
    db.shift.count({ where: { branchId: session.branchId } }),
    db.serviceOrder.count({ where: { branchId: session.branchId } }),
  ]);

  if (!branchState) redirect("/dashboard");
  const openingBalance = Number(openingBankBalance._sum.amount ?? 0);
  const fundingTotal = Number(groupFunding._sum.amount ?? 0);
  const bankReady = bankAccounts.some((account) => account.bankName && account.accountNumber && account.iban);
  const identityReady = Boolean(companyConfig.brand && companyConfig.bank.iban);
  const staffReady = employees >= 8;
  const fundingReady = parentCompanies > 0 && fundingTotal >= openingBalance && openingBalance > 0;
  const usersReady = activeUsers >= employees && employees > 0;
  const productsReady = physicalProducts > 0;
  const servicesReady = serviceProducts > 0;
  const stockReady = openingStockMovements > 0;
  const suppliersReady = suppliers > 0;

  const checklist = [
    { label: "التشطيبات وتجهيز الموقع", done: companyConfig.preopening.fitOutReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "الديكورات وتجهيز بيئة الاستقبال", done: companyConfig.preopening.decorationsReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "العدد والأدوات التشغيلية", done: companyConfig.preopening.toolsReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "المعدات التشغيلية", done: companyConfig.preopening.equipmentReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "التراخيص اللازمة للمركز", done: companyConfig.preopening.licensesReady, detail: "مؤكد إداريًا؛ تفاصيل وأرقام التراخيص تضاف عند تزويد النظام بالمستندات" },
    { label: "الهيكل الوظيفي الأساسي", done: staffReady, detail: `${employees} موظفين مسجلين` },
    { label: "هوية YCD OIL وبيانات المنشأة", done: identityReady, detail: "الهوية والألوان وبيانات الشركة مثبتة بالنظام" },
    { label: "الحساب البنكي الرئيسي", done: bankReady, detail: bankReady ? `${bankAccounts[0]?.bankName ?? "بنك"} · IBAN ينتهي بـ ${bankAccounts[0]?.iban?.slice(-4) ?? "—"}` : "بانتظار بيانات البنك" },
    { label: "الرصيد البنكي الافتتاحي", done: openingBalance > 0, detail: `${openingBalance.toFixed(2)} ر.س` },
    { label: "مصدر تمويل المشروع", done: fundingReady, detail: `تمويل مجموعة مسجل: ${fundingTotal.toFixed(2)} ر.س` },
    { label: "حسابات دخول الموظفين والصلاحيات", done: usersReady, detail: `${activeUsers} من ${employees} موظفين لديهم حسابات دخول مرتبطة` },
    { label: "دليل الزيوت والفلاتر والقطع", done: productsReady, detail: `${physicalProducts} صنف مادي مسجل` },
    { label: "دليل الخدمات والأسعار", done: servicesReady, detail: `${serviceProducts} خدمة مسجلة` },
    { label: "رصيد المخزون الافتتاحي", done: stockReady, detail: `${openingStockMovements} حركة توريد/رصيد موجبة مسجلة` },
    { label: "الموردون", done: suppliersReady, detail: `${suppliers} موردين نشطين` },
  ];

  const completed = checklist.filter((item) => item.done).length;
  const readinessPercent = Math.round((completed / checklist.length) * 100);
  const noOperationsYet = shifts === 0 && serviceOrders === 0;
  const canGoLive = hasPermission(session.permissions, PERMISSIONS.OPERATIONS_GO_LIVE);
  const phaseLabel = branchState.operationalStatus === "LIVE"
    ? "التشغيل التجاري"
    : branchState.operationalStatus === "SUSPENDED"
      ? "موقوف تشغيليًا"
      : "مرحلة ما قبل التشغيل التجاري";

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>جاهزية افتتاح وتشغيل YCD OIL</h1>
          <p>لوحة تجهيز ما قبل التشغيل للفرع الأول – الرياض - حي طويق.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>مرحلة المشروع</span><b>{phaseLabel}</b></article>
        <article><span>نسبة اكتمال بيانات التشغيل</span><b>{readinessPercent}%</b></article>
        <article><span>الموظفون المسجلون</span><b>{employees}</b></article>
        <article><span>التمويل الافتتاحي المسجل</span><b>{fundingTotal.toFixed(2)} ر.س</b></article>
      </section>

      <section className="workGrid">
        <article className="panel">
          <h2>حالة المركز</h2>
          <p>{statusBadge(noOperationsYet)} <b>{noOperationsYet ? "لم يبدأ التشغيل التجاري بعد" : "توجد حركات تشغيلية مسجلة"}</b></p>
          <p><span className="okBadge">المركز مجهز</span> التشطيبات والديكورات والعدد والمعدات والتراخيص مؤكدة من الإدارة.</p>
          <p><span className={branchState.operationalStatus === "LIVE" ? "okBadge" : "alertBadge"}>بوابة الإطلاق {branchState.operationalStatus === "LIVE" ? "مفتوحة" : "مقفلة"}</span> {branchState.operationalStatus === "LIVE" ? "الفرع مفعّل للتشغيل التجاري وفتح الورديات الحقيقية." : "فتح وردية تشغيل حقيقية محظور أثناء PREOPENING؛ يسمح به فقط في بيئة UAT المصرح بها."}</p>
          {branchState.goLiveAt && <p>تاريخ التفعيل: <b>{branchState.goLiveAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</b></p>}
          <GoLiveControl canGoLive={canGoLive} status={branchState.operationalStatus} />
          <p>الرصيد البنكي الافتتاحي: <b>{openingBalance.toFixed(2)} ر.س</b></p>
          <p>عمليات التمويل المسجلة: <b>{groupFunding._count}</b></p>
          <p className="muted">تم فصل تمويل الشركة الرئيسية عن إيرادات المبيعات حتى تظهر نتائج النشاط الفعلية بصورة صحيحة.</p>
        </article>

        <article className="panel">
          <h2>البيانات التي تمنع الإطلاق الكامل</h2>
          {!usersReady && <p>• بيانات دخول الموظفين الذين سيستخدمون النظام فعليًا.</p>}
          {!productsReady && <p>• قائمة الزيوت والفلاتر والقطع مع التكلفة وسعر البيع والوحدة والحد الأدنى.</p>}
          {!servicesReady && <p>• قائمة الخدمات وأسعارها وربط الخدمات المؤهلة لكوبون الغسيل.</p>}
          {!stockReady && <p>• الجرد الافتتاحي للمخزون بالكميات الفعلية.</p>}
          {!suppliersReady && <p>• بيانات الموردين الأساسيين وشروط التوريد.</p>}
          {usersReady && productsReady && servicesReady && stockReady && suppliersReady && (
            <p className="okBadge">بيانات الإطلاق الأساسية مكتملة وجاهزة لاختبارات التشغيل النهائي.</p>
          )}
        </article>
      </section>

      <article className="panel inventoryPanel">
        <h2>قائمة جاهزية التشغيل</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>البند</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {checklist.map((item) => (
                <tr key={item.label}>
                  <td><b>{item.label}</b></td>
                  <td>{statusBadge(item.done)}</td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel inventoryPanel">
        <h2>بيانات الحساب البنكي المثبتة</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>البنك</th><th>اسم الحساب</th><th>رقم الحساب</th><th>IBAN</th><th>الرصيد الافتتاحي</th></tr></thead>
            <tbody>
              {bankAccounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.bankName || "—"}</td>
                  <td>{account.nameAr}</td>
                  <td dir="ltr">{account.accountNumber || "—"}</td>
                  <td dir="ltr">{account.iban || "—"}</td>
                  <td><b>{openingBalance.toFixed(2)} ر.س</b></td>
                </tr>
              ))}
              {bankAccounts.length === 0 && <tr><td colSpan={5} className="empty">لا يوجد حساب بنكي مسجل.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <p className="formNotice">{branchState.operationalStatus === "LIVE"
        ? "الفرع مفعّل للتشغيل التجاري. تستمر الرقابة عبر الورديات والإقفالات والمطابقات وسجل التدقيق."
        : "المركز مجهز ميدانيًا، لكن التشغيل التجاري سيبقى مقفلًا في النظام حتى تكتمل بيانات الأصناف والخدمات والمخزون والموردين وحسابات المستخدمين وتنجح اختبارات UAT."}</p>
    </main>
  );
}
