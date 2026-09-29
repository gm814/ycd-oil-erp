import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { operationalTeam } from "@/lib/operations";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { UAT_CASES } from "@/lib/uat";
import PrintLaunchReport from "./print-launch-report";

function state(done: boolean) {
  return <span className={done ? "okBadge" : "alertBadge"}>{done ? "مكتمل" : "غير مكتمل"}</span>;
}

export default async function LaunchReportPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const [branch, employees, banks, physicalProducts, services, stock, suppliers, uat, preopening] = await Promise.all([
    db.branch.findUnique({ where: { id: session.branchId }, select: { nameAr: true, operationalStatus: true, goLiveAt: true } }),
    db.employee.findMany({
      where: { branchId: session.branchId, active: true },
      select: {
        code: true,
        nameAr: true,
        hireDate: true,
        user: { select: { status: true, passwordHash: true, roles: { select: { role: { select: { code: true } } } } } },
      },
      orderBy: { code: "asc" },
    }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId, active: true, type: "BANK" },
      select: { bankName: true, accountNumber: true, iban: true },
    }),
    db.product.count({ where: { active: true, category: { not: "SERVICE" } } }),
    db.product.count({ where: { active: true, category: "SERVICE" } }),
    db.stockMovement.count({ where: { branchId: session.branchId, quantity: { gt: 0 } } }),
    db.supplier.count({ where: { active: true } }),
    db.uatTestResult.findMany({ where: { branchId: session.branchId }, select: { caseCode: true, status: true, evidenceRef: true } }),
    db.preopeningLedgerAccount.findMany({
      where: { branchId: session.branchId },
      include: { entries: { select: { debit: true, credit: true } } },
    }),
  ]);
  if (!branch) redirect("/dashboard");

  const employeeByCode = new Map(employees.map((employee) => [employee.code, employee]));
  const teamRows = operationalTeam.map((member) => {
    const employee = employeeByCode.get(member.code);
    const roleCodes = new Set(employee?.user?.roles.map((entry) => entry.role.code) ?? []);
    const ready = Boolean(
      employee?.hireDate &&
      employee.user?.status === "ACTIVE" &&
      employee.user.passwordHash &&
      member.systemRoleCodes.every((code) => roleCodes.has(code))
    );
    return { member, ready };
  });
  const teamReady = teamRows.every((row) => row.ready);
  const bankReady = banks.some((account) =>
    account.bankName === companyConfig.bank.nameAr &&
    account.accountNumber === companyConfig.bank.accountNumber &&
    account.iban === companyConfig.bank.iban
  );
  const passed = new Set(
    uat.filter((item) => item.status === "PASSED" && Boolean(item.evidenceRef?.trim())).map((item) => item.caseCode)
  );
  const uatReady = UAT_CASES.every((item) => passed.has(item.code));
  const reported = preopening.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const imported = preopening.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0
  );
  const ledgerVariance = reported - imported;
  const ledgerReady = preopening.length > 0 && Math.abs(ledgerVariance) <= 0.01;

  const gates = [
    { label: "الهيكل الوظيفي وحسابات الدخول والصلاحيات", done: teamReady, detail: `${teamRows.filter((row) => row.ready).length} من ${teamRows.length}` },
    { label: "الحساب البنكي المعتمد", done: bankReady, detail: companyConfig.bank.nameAr },
    { label: "دليل الزيوت والفلاتر والقطع", done: physicalProducts > 0, detail: `${physicalProducts} صنف` },
    { label: "دليل الخدمات والأسعار", done: services > 0, detail: `${services} خدمة` },
    { label: "الجرد الافتتاحي", done: stock > 0, detail: `${stock} حركة موجبة` },
    { label: "الموردون الأساسيون", done: suppliers > 0, detail: `${suppliers} مورد` },
    { label: "مطابقة تكاليف ما قبل التشغيل", done: ledgerReady, detail: `الفرق ${ledgerVariance.toFixed(2)} ر.س` },
    { label: "اختبارات القبول التشغيلي UAT مع الأدلة", done: uatReady, detail: `${passed.size} من ${UAT_CASES.length}` },
  ];
  const ready = gates.every((gate) => gate.done);

  return (
    <main className="workspace invoiceWorkspace">
      <div className="workspaceTop noPrint">
        <div>
          <a href="/dashboard/readiness" className="backLink">← جاهزية التشغيل</a>
          <h1>محضر جاهزية الإطلاق التشغيلي</h1>
          <p>نسخة رقابية قابلة للطباعة قبل قرار GO LIVE.</p>
        </div>
        <PrintLaunchReport />
      </div>

      <article className="ycdDocument">
        <header className="ycdDocHeader">
          <div className="ycdDocBrand">
            <img src={companyConfig.brandIdentity.logoAsset} alt="YCD OIL" />
            <div><b>{companyConfig.legalNameAr}</b><span>{companyConfig.branch}</span></div>
          </div>
          <div className="ycdDocTitle">
            <span>GO-LIVE READINESS</span>
            <h1>محضر جاهزية الإطلاق التشغيلي</h1>
            <b>{ready ? "جاهز للقرار الإداري" : "غير جاهز للإطلاق"}</b>
          </div>
        </header>

        <section className="ycdDocMeta">
          <div><span>حالة الفرع</span><b>{branch.operationalStatus}</b></div>
          <div><span>البنك الرئيسي</span><b>{companyConfig.bank.nameAr}</b></div>
          <div><span>مرجع شهادة IBAN</span><b>{companyConfig.bank.certificateReference}</b></div>
          <div><span>تاريخ الشهادة</span><b>{companyConfig.bank.certificateDate}</b></div>
        </section>

        <section className="ycdLegalStrip">
          <div><span>الرقم الموحد</span><b>{companyConfig.unifiedNumber}</b></div>
          <div><span>السجل التجاري</span><b>{companyConfig.crNumber}</b></div>
          <div><span>الرقم الضريبي</span><b>{companyConfig.vatNumber}</b></div>
          <div><span>IBAN</span><b dir="ltr">{companyConfig.bank.iban}</b></div>
        </section>

        <section className="ycdDocTable">
          <h2>بوابات الإطلاق</h2>
          <table>
            <thead><tr><th>البند</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {gates.map((gate) => (
                <tr key={gate.label}><td><b>{gate.label}</b></td><td>{state(gate.done)}</td><td>{gate.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ycdDocTable">
          <h2>الفريق التشغيلي المعتمد</h2>
          <table>
            <thead><tr><th>الكود</th><th>الموظف</th><th>المسؤولية</th><th>الجاهزية</th></tr></thead>
            <tbody>
              {teamRows.map(({ member, ready: memberReady }) => (
                <tr key={member.code}>
                  <td>{member.code}</td><td><b>{member.nameAr}</b></td><td>{member.responsibilitiesAr.join(" · ")}</td><td>{state(memberReady)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ycdApprovals">
          <div><b>إعداد ومراجعة تشغيلية</b><span>مدير الفرع: {companyConfig.management.branchManager}</span><small>التوقيع: __________________</small></div>
          <div><b>مراجعة مالية</b><span>المحاسب العام: {companyConfig.management.generalAccountant}</span><small>التوقيع: __________________</small></div>
          <div><b>الاعتماد النهائي</b><span>المدير العام: {companyConfig.management.generalManager}</span><small>التوقيع: __________________</small></div>
        </section>

        <footer className="ycdDocFooter">
          <span>YCD OIL · {companyConfig.phone} · {companyConfig.email}</span>
          <b>{ready ? "جميع بوابات الإطلاق مكتملة" : "يمنع GO LIVE حتى استكمال البنود غير المكتملة"}</b>
        </footer>
      </article>
    </main>
  );
}
