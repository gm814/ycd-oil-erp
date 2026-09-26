import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import GroupFinanceActions from "./group-finance-actions";

const relationLabel: Record<string, string> = {
  PARENT: "الشركة الرئيسية",
  SUBSIDIARY: "شركة تابعة",
  AFFILIATE: "شركة شقيقة / مرتبطة",
};

export default async function GroupFinancePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const canManageFunding = hasPermission(session.permissions, PERMISSIONS.GROUP_FUNDING_MANAGE);
  const [companies, accounts, fundings] = await Promise.all([
    db.groupCompany.findMany({ where: { active: true }, orderBy: [{ relationType: "asc" }, { legalNameAr: "asc" }] }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId, active: true, type: { in: ["CASH", "BANK"] } },
      include: { transactions: { select: { amount: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.groupFunding.findMany({
      where: { branchId: session.branchId },
      include: { sourceCompany: true, account: true },
      orderBy: { fundedAt: "desc" },
      take: 100,
    }),
  ]);

  const totalFunding = fundings.reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/finance" className="backLink">← المالية والبنوك</a>
          <h1>شركات المجموعة وتمويل المشروع</h1>
          <p>سجل مستقل لمصادر التمويل من الشركة الرئيسية والشركات التابعة أو المرتبطة دون اعتبار التمويل إيراد مبيعات.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>شركات المجموعة المسجلة</span><b>{companies.length}</b></article>
        <article><span>إجمالي التمويل المسجل</span><b>{totalFunding.toFixed(2)} ر.س</b></article>
        <article><span>عدد عمليات التمويل</span><b>{fundings.length}</b></article>
      </section>

      {canManageFunding && (
        <GroupFinanceActions
          companies={companies.map((company) => ({ id: company.id, legalNameAr: company.legalNameAr, relationType: company.relationType }))}
          accounts={accounts.map((account) => ({
            id: account.id,
            nameAr: account.nameAr,
            type: account.type,
            balance: account.transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0),
          }))}
        />
      )}

      <section className="workGrid">
        <article className="panel">
          <h2>شركات المجموعة</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الكود</th><th>الشركة</th><th>العلاقة</th><th>الرقم الموحد</th><th>السجل التجاري</th></tr></thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>{company.code}</td>
                    <td><b>{company.legalNameAr}</b>{company.brandName && <><br /><small>{company.brandName}</small></>}</td>
                    <td>{relationLabel[company.relationType] ?? company.relationType}</td>
                    <td>{company.unifiedNumber || "بانتظار البيانات"}</td>
                    <td>{company.crNumber || "بانتظار البيانات"}</td>
                  </tr>
                ))}
                {companies.length === 0 && <tr><td colSpan={5} className="empty">لا توجد شركات مجموعة مسجلة.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>سجل تمويل YCD OIL</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>التاريخ</th><th>المصدر</th><th>الحساب المستلم</th><th>المرجع</th><th>المبلغ</th></tr></thead>
              <tbody>
                {fundings.map((funding) => (
                  <tr key={funding.id}>
                    <td>{funding.fundedAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                    <td>{funding.sourceCompany.legalNameAr}</td>
                    <td>{funding.account.nameAr}</td>
                    <td>{funding.reference || "—"}</td>
                    <td className="moneyIn"><b>{Number(funding.amount).toFixed(2)} ر.س</b></td>
                  </tr>
                ))}
                {fundings.length === 0 && <tr><td colSpan={5} className="empty">لا توجد عمليات تمويل مسجلة.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
