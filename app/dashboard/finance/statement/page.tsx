import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";
import PrintButton from "./print-button";

const typeLabel: Record<string, string> = {
  OPENING_BALANCE: "رصيد افتتاحي",
  CUSTOMER_RECEIPT: "تحصيل عميل",
  CUSTOMER_REFUND: "استرداد عميل",
  SUPPLIER_PAYMENT: "سداد مورد",
  EXPENSE: "مصروف / رسوم",
  TRANSFER_IN: "تحويل وارد",
  TRANSFER_OUT: "تحويل صادر",
  CUSTODY_ISSUE: "صرف عهدة",
  CUSTODY_SETTLEMENT: "تسوية عهدة",
  PAYROLL_PAYMENT: "صرف رواتب",
  ADJUSTMENT: "تسوية مالية",
};

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export default async function FinancialStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const params = await searchParams;
  const defaults = riyadhMonthToDateStrings();
  const requestedFrom = params.from || defaults.from;
  const requestedTo = params.to || defaults.to;
  const requestedRange = riyadhDateRange(requestedFrom, requestedTo);
  const range = requestedRange ?? riyadhDateRange(defaults.from, defaults.to)!;
  const from = requestedRange ? requestedFrom : defaults.from;
  const to = requestedRange ? requestedTo : defaults.to;

  const accounts = await db.financialAccount.findMany({
    where: { branchId: session.branchId, active: true },
    orderBy: [{ type: "asc" }, { nameAr: "asc" }],
  });
  const selectedAccount = accounts.some((account) => account.id === params.account) ? params.account : undefined;

  const [openingRows, transactions] = await Promise.all([
    db.financialTransaction.groupBy({
      by: ["accountId"],
      where: {
        branchId: session.branchId,
        createdAt: { lt: range.start },
        ...(selectedAccount ? { accountId: selectedAccount } : {}),
      },
      _sum: { amount: true },
    }),
    db.financialTransaction.findMany({
      where: {
        branchId: session.branchId,
        createdAt: { gte: range.start, lt: range.end },
        ...(selectedAccount ? { accountId: selectedAccount } : {}),
      },
      include: { account: { select: { nameAr: true, code: true, type: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 1000,
    }),
  ]);

  const runningByAccount = new Map<string, number>();
  for (const row of openingRows) runningByAccount.set(row.accountId, Number(row._sum.amount ?? 0));

  const rows = transactions.map((transaction) => {
    const balance = (runningByAccount.get(transaction.accountId) ?? 0) + Number(transaction.amount);
    runningByAccount.set(transaction.accountId, balance);
    return { transaction, balance };
  });

  const inflow = transactions.filter((item) => Number(item.amount) > 0)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const outflow = transactions.filter((item) => Number(item.amount) < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const operatingExpenses = transactions
    .filter((item) => item.type === "EXPENSE" && ["OperatingExpense", "ExpenseRequest"].includes(item.relatedEntityType ?? ""))
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const posFees = transactions
    .filter((item) => item.type === "EXPENSE" && item.relatedEntityType === "PosSettlementFee")
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);

  return (
    <main className="workspace invoiceWorkspace">
      <div className="workspaceTop noPrint">
        <div>
          <a href="/dashboard/finance" className="backLink">← المالية والبنوك</a>
          <h1>كشف الحركة المالية والقيود التشغيلية</h1>
          <p>تتبع الحركات حسب الحساب والفترة مع الرصيد الجاري لكل حساب.</p>
        </div>
        <PrintButton />
      </div>

      <article className="panel reportFilter noPrint">
        <form method="get" className="reportFilterForm">
          <label>من<input type="date" name="from" defaultValue={from} /></label>
          <label>إلى<input type="date" name="to" defaultValue={to} /></label>
          <label>الحساب
            <select name="account" defaultValue={selectedAccount ?? ""}>
              <option value="">جميع الحسابات</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr} — {account.code}</option>)}
            </select>
          </label>
          <button type="submit">تحديث الكشف</button>
        </form>
      </article>

      <section className="kpis statementKpis">
        <article><span>الحركات الداخلة</span><b>{money(inflow)}</b></article>
        <article><span>الحركات الخارجة</span><b>{money(outflow)}</b></article>
        <article><span>المصروفات التشغيلية</span><b>{money(operatingExpenses)}</b></article>
        <article><span>رسوم مدى / الشبكة</span><b>{money(posFees)}</b></article>
      </section>

      <article className="panel inventoryPanel">
        <h2>الحركة من {from} إلى {to}</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>البيان</th><th>المرجع</th><th>داخل</th><th>خارج</th><th>الرصيد الجاري</th><th className="noPrint">السند</th></tr>
            </thead>
            <tbody>
              {rows.map(({ transaction, balance }) => {
                const amount = Number(transaction.amount);
                return (
                  <tr key={transaction.id}>
                    <td>{transaction.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                    <td>{transaction.account.nameAr}<br /><small>{transaction.account.code}</small></td>
                    <td>{typeLabel[transaction.type] ?? transaction.type}</td>
                    <td>{transaction.descriptionAr}</td>
                    <td>{transaction.reference || "—"}</td>
                    <td className="moneyIn">{amount > 0 ? money(amount) : "—"}</td>
                    <td className="moneyOut">{amount < 0 ? money(Math.abs(amount)) : "—"}</td>
                    <td><b>{money(balance)}</b></td>
                    <td className="noPrint"><a className="orderLink" href={`/dashboard/finance/transactions/${transaction.id}/voucher`}>{amount >= 0 ? "سند قبض" : "سند صرف"}</a></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={9} className="empty">لا توجد حركات مالية ضمن الفترة المحددة.</td></tr>}
            </tbody>
          </table>
        </div>
        {transactions.length === 1000 && <p className="formNotice">تم عرض أول 1000 حركة؛ ضيّق الفترة أو اختر حسابًا للحصول على كشف أدق.</p>}
      </article>
    </main>
  );
}
