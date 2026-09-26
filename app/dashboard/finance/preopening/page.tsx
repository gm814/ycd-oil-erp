import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export default async function PreopeningLedgerPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const accounts = await db.preopeningLedgerAccount.findMany({
    where: { branchId: session.branchId },
    include: { entries: { orderBy: [{ entryDate: "asc" }, { sourceEntryKey: "asc" }] } },
    orderBy: { sourceAccountNo: "asc" },
  });

  const reportedTotal = accounts.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const importedTotal = accounts.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0,
  );
  const variance = reportedTotal - importedTotal;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/finance" className="backLink">← المالية والبنوك</a>
          <h1>سجل تكاليف وأصول ما قبل التشغيل</h1>
          <p>نسخة رقابية من كشوف المحاسب المستلمة بتاريخ 27/09/2026، محفوظة كما وردت في المصدر دون إعادة تصنيف محاسبي.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>إجمالي الأرصدة حسب المصدر</span><b>{money(reportedTotal)}</b></article>
        <article><span>إجمالي القيود المستوردة</span><b>{money(importedTotal)}</b></article>
        <article><span>فرق المطابقة</span><b className={Math.abs(variance) > 0.01 ? "moneyOut" : "moneyIn"}>{money(variance)}</b></article>
        <article><span>عدد القيود</span><b>{accounts.reduce((sum, account) => sum + account.entries.length, 0).toLocaleString("ar-SA")}</b></article>
      </section>

      <article className="panel">
        <h2>تنبيه محاسبي</h2>
        <p>
          هذه الأرصدة تمثل كشوف المصدر قبل بدء التشغيل التجاري للمركز. لا تدخل تلقائيًا في رصيد الصندوق أو البنك،
          ولا تعتبر مصروفات تشغيلية للفترة الحالية إلا بعد اعتماد التصنيف المحاسبي النهائي.
        </p>
      </article>

      {accounts.map((account) => {
        const entryTotal = account.entries.reduce((sum, entry) => sum + Number(entry.debit) - Number(entry.credit), 0);
        const accountVariance = Number(account.reportedBalance) - entryTotal;
        return (
          <article className="panel inventoryPanel" key={account.id}>
            <div className="sectionHeading">
              <div>
                <h2>{account.sourceAccountNo} — {account.sourceAccountName}</h2>
                <p>{account.sourceFileName} · الرصيد حسب المصدر {money(Number(account.reportedBalance))}</p>
              </div>
              <span className={Math.abs(accountVariance) > 0.01 ? "alertBadge" : "okBadge"}>
                {Math.abs(accountVariance) > 0.01 ? `فرق ${money(accountVariance)}` : "مطابق للمصدر"}
              </span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th><th>قيد</th><th>مستند</th><th>مرجع</th><th>البيان</th>
                    <th>مدين</th><th>دائن</th><th>الرصيد بالمصدر</th><th>صفحة</th>
                  </tr>
                </thead>
                <tbody>
                  {account.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.entryDate.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                      <td>{entry.journalNo || "—"}</td>
                      <td>{entry.documentNo || "—"}</td>
                      <td>{entry.reference || "—"}</td>
                      <td>{entry.descriptionAr}</td>
                      <td>{Number(entry.debit) ? money(Number(entry.debit)) : "—"}</td>
                      <td>{Number(entry.credit) ? money(Number(entry.credit)) : "—"}</td>
                      <td>{entry.runningBalance !== null ? money(Number(entry.runningBalance)) : "—"}</td>
                      <td>{entry.sourcePage || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}

      {accounts.length === 0 && <article className="panel empty">لم يتم تحميل كشوف ما قبل التشغيل بعد.</article>}
    </main>
  );
}
