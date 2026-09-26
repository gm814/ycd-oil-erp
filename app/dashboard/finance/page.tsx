import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import FinanceActions from "./finance-actions";

const typeLabel: Record<string, string> = {
  CASH: "صندوق نقدي",
  BANK: "حساب بنكي",
  POS_CLEARING: "تسويات شبكة / POS",
};

export default async function FinancePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const [accounts, transactions, supplierInvoices] = await Promise.all([
    db.financialAccount.findMany({
      where: { branchId: session.branchId, active: true },
      include: { transactions: { select: { amount: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.financialTransaction.findMany({
      where: { branchId: session.branchId },
      include: { account: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.supplierInvoice.findMany({
      where: { branchId: session.branchId, status: "APPROVED_FOR_PAYMENT" },
      include: { supplier: true, purchaseOrder: true },
      orderBy: { approvedForPaymentAt: "asc" },
    }),
  ]);

  const accountRows = accounts.map((account) => ({
    id: account.id,
    code: account.code,
    nameAr: account.nameAr,
    type: account.type,
    balance: account.transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0),
  }));

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المالية والبنوك</h1>
          <p>الصناديق والحسابات البنكية، الأرصدة، وحركة سداد الموردين بعد الاعتماد.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <FinanceActions
        accounts={accountRows}
        invoices={supplierInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          supplier: invoice.supplier.nameAr,
          orderNo: invoice.purchaseOrder.orderNo,
          total: Number(invoice.total),
        }))}
      />

      <article className="panel inventoryPanel">
        <h2>الحسابات والأرصدة</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th>الرصيد</th></tr></thead>
            <tbody>
              {accountRows.map((account) => (
                <tr key={account.id}>
                  <td>{account.code}</td><td>{account.nameAr}</td><td>{typeLabel[account.type] ?? account.type}</td>
                  <td><b>{account.balance.toFixed(2)} ر.س</b></td>
                </tr>
              ))}
              {accountRows.length === 0 && <tr><td colSpan={4} className="empty">لا توجد حسابات مالية.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel inventoryPanel">
        <h2>آخر الحركات المالية</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr></thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.createdAt.toLocaleString("ar-SA")}</td>
                  <td>{transaction.account.nameAr}</td>
                  <td>{transaction.type}</td>
                  <td>{transaction.descriptionAr}</td>
                  <td>{transaction.reference || "—"}</td>
                  <td className={Number(transaction.amount) < 0 ? "moneyOut" : "moneyIn"}>{Number(transaction.amount).toFixed(2)} ر.س</td>
                </tr>
              ))}
              {transactions.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حركات مالية بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
