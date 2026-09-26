import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import FinanceActions from "./finance-actions";

const typeLabel: Record<string, string> = {
  CASH: "صندوق نقدي",
  BANK: "حساب بنكي",
  POS_CLEARING: "تسويات شبكة / POS",
};

const transactionLabel: Record<string, string> = {
  OPENING_BALANCE: "رصيد افتتاحي",
  CUSTOMER_RECEIPT: "تحصيل عميل",
  CUSTOMER_REFUND: "استرداد عميل",
  SUPPLIER_PAYMENT: "سداد مورد",
  EXPENSE: "مصروف تشغيلي / رسوم",
  TRANSFER_IN: "تحويل وارد",
  TRANSFER_OUT: "تحويل صادر",
  CUSTODY_ISSUE: "صرف عهدة",
  CUSTODY_SETTLEMENT: "تسوية عهدة",
  PAYROLL_PAYMENT: "صرف رواتب",
  ADJUSTMENT: "تسوية مالية",
};

export default async function FinancePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const canManage = hasPermission(session.permissions, PERMISSIONS.FINANCE_MANAGE);
  const canExpense = hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE);
  const canTransfer = hasPermission(session.permissions, PERMISSIONS.FINANCE_TRANSFER);
  const canPosSettle = hasPermission(session.permissions, PERMISSIONS.POS_SETTLE);
  const canPaySupplier = hasPermission(session.permissions, PERMISSIONS.SUPPLIER_PAYMENT_EXECUTE);

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
          <p>إدارة الصندوق والبنوك، المصروفات التشغيلية، التحويلات، وتسويات مدى مع رقابة كاملة على الحركة.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <FinanceActions
        accounts={accountRows}
        canManage={canManage}
        canExpense={canExpense}
        canTransfer={canTransfer}
        canPosSettle={canPosSettle}
        canPaySupplier={canPaySupplier}
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
                  <td>{transactionLabel[transaction.type] ?? transaction.type}</td>
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
