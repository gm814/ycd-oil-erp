import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import PrintButton from "./print-button";

function money(value: number) {
  return value.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة بانتظار المراجعة",
  REVIEWED: "تمت المراجعة",
  CLOSED: "مقفل نهائيًا",
};

export default async function FinancialCloseReport({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW) && !hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const close = await db.financialClose.findFirst({ where: { id, branchId: session.branchId } });
  if (!close) notFound();
  const inclusiveEnd = new Date(close.periodEnd.getTime() - 1);

  const rows = [
    ["إجمالي المبيعات", Number(close.salesTotal)],
    ["تحصيل نقدي", Number(close.cashCollections)],
    ["تحصيل مدى / بطاقات", Number(close.cardCollections)],
    ["تحويلات بنكية", Number(close.transferCollections)],
    ["مبيعات آجلة", Number(close.creditSales)],
    ["مرتجعات المبيعات", Number(close.refundsTotal)],
    ["مصروفات تشغيلية", Number(close.operatingExpenses)],
    ["سداد موردين", Number(close.supplierPayments)],
    ["صرف رواتب", Number(close.payrollPayments)],
    ["صرف عهد", Number(close.custodyIssues)],
    ["صافي الحركة المالية", Number(close.netFinancialMovement)],
  ] as const;

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/finance/closes" className="backLink">← الإقفالات المالية</a>
        <PrintButton />
      </div>

      <article className="invoiceDocument">
        <header className="invoiceHeader">
          <div>
            <img className="invoiceBrandLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
            <b>{companyConfig.legalNameAr}</b>
            <p>{companyConfig.branch} · {companyConfig.phone}</p>
            <p>الرقم الضريبي: {companyConfig.vatNumber}</p>
          </div>
          <div className="invoiceTitle">
            <span>{close.type === "DAILY" ? "تقرير الإقفال المالي اليومي" : "تقرير الإقفال المالي الشهري"}</span>
            <h1>{close.closeNo}</h1>
            <p>الفترة: {close.periodStart.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })} — {inclusiveEnd.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p>
            <p>الحالة: {statusLabel[close.status] ?? close.status}</p>
          </div>
        </header>

        <section className="kpis statementKpis">
          <article><span>المبيعات</span><b>{money(Number(close.salesTotal))}</b></article>
          <article><span>صافي الحركة</span><b>{money(Number(close.netFinancialMovement))}</b></article>
          <article><span>فروقات ورديات غير معالجة</span><b>{close.unresolvedShiftVariances.toLocaleString("ar-SA-u-nu-latn")}</b></article>
          <article><span>مطابقات بنكية معلقة</span><b>{close.unresolvedBankReconciliations.toLocaleString("ar-SA-u-nu-latn")}</b></article>
        </section>

        <article className="panel inventoryPanel">
          <h2>الملخص المالي الموحد</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
              <tbody>
                {rows.map(([label, value]) => <tr key={label}><td>{label}</td><td>{money(value)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel inventoryPanel">
          <h2>فحوصات الإقفال الرقابية</h2>
          <div className="reportList">
            <div><span>ورديات مفتوحة داخل الفترة</span><b className={close.openShifts ? "alertBadge" : "okBadge"}>{close.openShifts}</b></div>
            <div><span>فروقات ورديات غير معتمدة</span><b className={close.unresolvedShiftVariances ? "alertBadge" : "okBadge"}>{close.unresolvedShiftVariances}</b></div>
            <div><span>مطابقات بنكية غير مقفلة / بها فرق</span><b className={close.unresolvedBankReconciliations ? "alertBadge" : "okBadge"}>{close.unresolvedBankReconciliations}</b></div>
          </div>
          <p>{close.status === "CLOSED" ? "تم اجتياز ضوابط الإقفال وإقفال الفترة نهائيًا." : "الإقفال النهائي مشروط بمعالجة جميع التنبيهات الرقابية."}</p>
        </article>

        <section className="invoicePolicy">
          <b>ملاحظات الإقفال</b>
          <p>{close.notes || "لا توجد ملاحظات مسجلة."}</p>
        </section>

        <footer className="invoiceFooter">
          <p>تقرير رقابي صادر من نظام YCD OIL ERP · لا يسمح بالإقفال النهائي مع فروقات ورديات أو مطابقات بنكية غير معالجة، ويشترط للإقفال الشهري اكتمال الإقفالات اليومية التابعة للشهر.</p>
        </footer>
      </article>
    </main>
  );
}
