import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { operationalTeam } from "@/lib/operations";
import { UAT_CASES } from "@/lib/uat";
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
    preopeningAccounts,
    uatResults,
    shifts,
    serviceOrders,
  ] = await Promise.all([
    db.branch.findUnique({
      where: { id: session.branchId },
      select: { operationalStatus: true, goLiveAt: true },
    }),
    db.employee.findMany({
      where: { branchId: session.branchId, active: true },
      select: {
        code: true,
        nameAr: true,
        hireDate: true,
        user: {
          select: {
            status: true,
            passwordHash: true,
            roles: { select: { role: { select: { code: true, nameAr: true } } } },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
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
    db.preopeningLedgerAccount.findMany({
      where: { branchId: session.branchId },
      include: { entries: { select: { debit: true, credit: true } } },
      orderBy: { sourceAccountNo: "asc" },
    }),
    db.uatTestResult.findMany({
      where: { branchId: session.branchId },
      select: { caseCode: true, status: true },
    }),
    db.shift.count({ where: { branchId: session.branchId } }),
    db.serviceOrder.count({ where: { branchId: session.branchId } }),
  ]);

  if (!branchState) redirect("/dashboard");
  const openingBalance = Number(openingBankBalance._sum.amount ?? 0);
  const fundingTotal = Number(groupFunding._sum.amount ?? 0);
  const bankReady = bankAccounts.some((account) => account.bankName && account.accountNumber && account.iban);
  const identityReady = Boolean(companyConfig.brand && companyConfig.bank.iban);
  const staffReady = employees.length >= operationalTeam.length;
  const hrReadyCount = employees.filter((employee) => employee.hireDate).length;
  const hrReady = employees.length >= operationalTeam.length && hrReadyCount === employees.length;
  const fundingReady = parentCompanies > 0 && fundingTotal >= openingBalance && openingBalance > 0;
  const employeeByCode = new Map(employees.map((employee) => [employee.code, employee]));
  const accessRows = operationalTeam.map((member) => {
    const employee = employeeByCode.get(member.code);
    const user = employee?.user;
    const actualRoleCodes = new Set(user?.roles.map((entry) => entry.role.code) ?? []);
    const accountReady = Boolean(user?.status === "ACTIVE" && user.passwordHash);
    const rolesReady = member.systemRoleCodes.every((roleCode) => actualRoleCodes.has(roleCode));
    return { member, employee, user, accountReady, rolesReady };
  });
  const accessReadyCount = accessRows.filter((row) => row.accountReady && row.rolesReady).length;
  const usersReady = accessRows.length > 0 && accessReadyCount === accessRows.length;
  const productsReady = physicalProducts > 0;
  const servicesReady = serviceProducts > 0;
  const stockReady = openingStockMovements > 0;
  const suppliersReady = suppliers > 0;
  const passedUatCodes = new Set(uatResults.filter((item) => item.status === "PASSED").map((item) => item.caseCode));
  const passedUat = UAT_CASES.filter((item) => passedUatCodes.has(item.code)).length;
  const uatReady = passedUat === UAT_CASES.length;
  const preopeningReportedTotal = preopeningAccounts.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const preopeningImportedTotal = preopeningAccounts.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0,
  );
  const preopeningVariance = preopeningReportedTotal - preopeningImportedTotal;
  const preopeningLedgerReady = preopeningAccounts.length > 0 && Math.abs(preopeningVariance) <= 0.01;
  const correctedSetupAccount = preopeningAccounts.find((account) => account.sourceAccountNo === "11080302");

  const checklist = [
    { label: "التشطيبات وتجهيز الموقع", done: companyConfig.preopening.fitOutReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "الديكورات وتجهيز بيئة الاستقبال", done: companyConfig.preopening.decorationsReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "العدد والأدوات التشغيلية", done: companyConfig.preopening.toolsReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "المعدات التشغيلية", done: companyConfig.preopening.equipmentReady, detail: companyConfig.preopening.readinessSourceAr },
    { label: "التراخيص اللازمة للمركز", done: companyConfig.preopening.licensesReady, detail: "مؤكد إداريًا؛ تفاصيل وأرقام التراخيص تضاف عند تزويد النظام بالمستندات" },
    { label: "الهيكل الوظيفي الأساسي", done: staffReady, detail: `${employees.length} موظفين مسجلين` },
    { label: "بيانات الموارد البشرية والرواتب", done: hrReady, detail: `${hrReadyCount} من ${employees.length} ملفات موظفين مكتملة بتاريخ تعيين` },
    { label: "هوية YCD OIL وبيانات المنشأة", done: identityReady, detail: "الهوية والألوان وبيانات الشركة مثبتة بالنظام" },
    { label: "الحساب البنكي الرئيسي", done: bankReady, detail: bankReady ? `${bankAccounts[0]?.bankName ?? "بنك"} · IBAN ينتهي بـ ${bankAccounts[0]?.iban?.slice(-4) ?? "—"}` : "بانتظار بيانات البنك" },
    { label: "الرصيد البنكي الافتتاحي", done: openingBalance > 0, detail: `${openingBalance.toFixed(2)} ر.س` },
    { label: "مصدر تمويل المشروع", done: fundingReady, detail: `تمويل مجموعة مسجل: ${fundingTotal.toFixed(2)} ر.س` },
    { label: "مطابقة سجل تكاليف ما قبل التشغيل", done: preopeningLedgerReady, detail: preopeningLedgerReady ? `مطابق: ${preopeningReportedTotal.toFixed(2)} ر.س · الحساب 11080302 معتمد برصيد ${Number(correctedSetupAccount?.reportedBalance ?? 0).toFixed(2)} ر.س` : `فرق المطابقة: ${preopeningVariance.toFixed(2)} ر.س` },
    { label: "حسابات دخول الموظفين والصلاحيات", done: usersReady, detail: `${accessReadyCount} من ${accessRows.length} حسابات مطابقة لخطة الصلاحيات المعتمدة` },
    { label: "دليل الزيوت والفلاتر والقطع", done: productsReady, detail: `${physicalProducts} صنف مادي مسجل` },
    { label: "دليل الخدمات والأسعار", done: servicesReady, detail: `${serviceProducts} خدمة مسجلة` },
    { label: "رصيد المخزون الافتتاحي", done: stockReady, detail: `${openingStockMovements} حركة توريد/رصيد موجبة مسجلة` },
    { label: "الموردون", done: suppliersReady, detail: `${suppliers} موردين نشطين` },
    { label: "اختبارات القبول التشغيلي UAT", done: uatReady, detail: `${passedUat} من ${UAT_CASES.length} سيناريو ناجح` },
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
        <article><span>الموظفون المسجلون</span><b>{employees.length}</b></article>
        <article><span>التمويل الافتتاحي المسجل</span><b>{fundingTotal.toFixed(2)} ر.س</b></article>
      </section>

      <div className="readinessActionBar">
        <div className="actionStack">
          <a className="primaryLink" href="/dashboard/readiness/import">استيراد بيانات ما قبل التشغيل</a>
          {hasPermission(session.permissions, PERMISSIONS.USER_MANAGE) && (
            <a className="secondaryLink" href="/dashboard/admin/users">تهيئة حسابات الفريق والصلاحيات</a>
          )}
          <a className="secondaryLink" href="/dashboard/readiness/uat">اختبارات القبول التشغيلي UAT</a>
        </div>
        <span className="muted">بيانات الفريق والبنك والهوية مثبتة؛ المتبقي حسابات الدخول وبيانات HR الفعلية والأصناف والخدمات والمخزون والموردون.</span>
      </div>

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
          <p>سجل ما قبل التشغيل: <b>{preopeningReportedTotal.toFixed(2)} ر.س</b> · فرق المطابقة: <b>{preopeningVariance.toFixed(2)} ر.س</b></p>
          <p>الرصيد المصحح للحساب 11080302: <b>{Number(correctedSetupAccount?.reportedBalance ?? 0).toFixed(2)} ر.س</b></p>
          <p className="muted">تم فصل تمويل الشركة الرئيسية عن إيرادات المبيعات حتى تظهر نتائج النشاط الفعلية بصورة صحيحة.</p>
        </article>

        <article className="panel">
          <h2>البيانات التي تمنع الإطلاق الكامل</h2>
          {!preopeningLedgerReady && <p>• مطابقة كشوف وتكاليف ما قبل التشغيل مع القيود المستوردة.</p>}
          {!usersReady && <p>• بيانات دخول الموظفين الذين سيستخدمون النظام فعليًا.</p>}
          {!hrReady && <p>• استكمال بيانات الموظفين والرواتب والبدلات وتاريخ التعيين من ملف الموارد البشرية.</p>}
          {!productsReady && <p>• قائمة الزيوت والفلاتر والقطع مع التكلفة وسعر البيع والوحدة والحد الأدنى.</p>}
          {!servicesReady && <p>• قائمة الخدمات وأسعارها وربط الخدمات المؤهلة لكوبون الغسيل.</p>}
          {!stockReady && <p>• الجرد الافتتاحي للمخزون بالكميات الفعلية.</p>}
          {!suppliersReady && <p>• بيانات الموردين الأساسيين وشروط التوريد.</p>}
          {!uatReady && <p>• اجتياز جميع اختبارات القبول التشغيلي UAT: المنجز حاليًا {passedUat} من {UAT_CASES.length}.</p>}
          {preopeningLedgerReady && usersReady && hrReady && productsReady && servicesReady && stockReady && suppliersReady && !uatReady && (
            <p className="formNotice">بيانات الإطلاق الأساسية مكتملة؛ المتبقي تنفيذ واعتماد UAT.</p>
          )}
          {preopeningLedgerReady && usersReady && hrReady && productsReady && servicesReady && stockReady && suppliersReady && uatReady && (
            <p className="okBadge">بيانات الإطلاق واختبارات UAT مكتملة وجاهزة لقرار GO LIVE.</p>
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
        <h2>خطة حسابات الدخول والصلاحيات قبل الإطلاق</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الموظف</th><th>المسؤوليات</th><th>الأدوار النظامية المعتمدة</th><th>حساب الدخول</th><th>مطابقة الصلاحيات</th></tr></thead>
            <tbody>
              {accessRows.map(({ member, user, accountReady, rolesReady }) => (
                <tr key={member.code}>
                  <td><b>{member.nameAr}</b><br /><small>{member.code}</small></td>
                  <td>{member.responsibilitiesAr.join(" · ")}</td>
                  <td>{member.systemRolesAr.join(" + ")}</td>
                  <td>{accountReady ? <span className="okBadge">نشط ومؤمّن</span> : <span className="alertBadge">بانتظار إنشاء الحساب</span>}</td>
                  <td>{rolesReady ? <span className="okBadge">مطابق</span> : <span className="alertBadge">يحتاج استكمال الأدوار</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">لا يتم إنشاء كلمات مرور تلقائيًا. تُنشأ الحسابات من شاشة المستخدمين بواسطة المدير العام، وتكون كلمة المرور مؤقتة ويُلزم الموظف بتغييرها عند أول دخول.</p>
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
        <p className="muted">مصدر التحقق: {companyConfig.bank.certificateSourceAr} · المرجع {companyConfig.bank.certificateReference} · بتاريخ {companyConfig.bank.certificateDate}.</p>
      </article>

      <p className="formNotice">{branchState.operationalStatus === "LIVE"
        ? "الفرع مفعّل للتشغيل التجاري. تستمر الرقابة عبر الورديات والإقفالات والمطابقات وسجل التدقيق."
        : "المركز مجهز ميدانيًا، لكن التشغيل التجاري سيبقى مقفلًا حتى تكتمل بيانات HR والأصناف والخدمات والمخزون والموردين وحسابات المستخدمين وتنجح اختبارات UAT."}</p>
    </main>
  );
}
