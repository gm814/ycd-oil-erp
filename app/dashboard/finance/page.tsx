import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { companyConfig } from "@/lib/config";
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
  GROUP_FUNDING: "تمويل من شركات المجموعة",
};

export default async function FinancePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const canManage = hasPermission(session.permissions, PERMISSIONS.FINANCE_MANAGE);
  const canExpense = hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE);
  const canExpenseApprove = hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_APPROVE);
  const canExpensePay = hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_PAY);
  const canBankReconcile = hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE);
  const canBankReview = hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE_REVIEW);
  const canTransfer = hasPermission(session.permissions, PERMISSIONS.FINANCE_TRANSFER);
  const canPosSettle = hasPermission(session.permissions, PERMISSIONS.POS_SETTLE);
  const canPaySupplier = hasPermission(session.permissions, PERMISSIONS.SUPPLIER_PAYMENT_EXECUTE);

  const [accounts, transactions, supplierInvoices, expenseRequests, reconciliations] = await Promise.all([
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
    db.expenseRequest.findMany({
      where: { branchId: session.branchId },
      include: { account: { select: { nameAr: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.bankReconciliation.findMany({
      where: { branchId: session.branchId },
      include: { account: { select: { nameAr: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const accountRows = accounts.map((account) => ({
    id: account.id,
    code: account.code,
    nameAr: account.nameAr,
    type: account.type,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    iban: account.iban,
    balance: account.transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0),
  }));
  const cashBalance = accountRows.filter((account) => account.type === "CASH").reduce((sum, account) => sum + account.balance, 0);
  const bankBalance = accountRows.filter((account) => account.type === "BANK").reduce((sum, account) => sum + account.balance, 0);
  const posBalance = accountRows.filter((account) => account.type === "POS_CLEARING").reduce((sum, account) => sum + account.balance, 0);
  const liquidBalance = cashBalance + bankBalance + posBalance;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المالية والبنوك</h1>
          <p>إدارة الصندوق والبنوك، المصروفات التشغيلية، التحويلات، وتسويات مدى مع رقابة كاملة على الحركة.</p>
        </div>
        <div className="actionStack noPrint">
          <a className="secondaryButton" href="/dashboard/finance/group">شركات المجموعة والتمويل</a>
          <a className="secondaryButton" href="/dashboard/finance/preopening">تكاليف وأصول ما قبل التشغيل</a>
          <a className="secondaryButton" href="/dashboard/finance/closes">الإقفال اليومي والشهري</a>
          <a className="secondaryButton" href="/dashboard/finance/statement">كشف الحركة والقيود</a>
          <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
        </div>
      </div>

      <section className="kpis reportKpis">
        <article><span>رصيد الصناديق</span><b>{cashBalance.toFixed(2)} ر.س</b></article>
        <article><span>رصيد البنوك</span><b>{bankBalance.toFixed(2)} ر.س</b></article>
        <article><span>مبالغ مدى قيد التسوية</span><b>{posBalance.toFixed(2)} ر.س</b></article>
        <article><span>إجمالي الأرصدة التشغيلية</span><b>{liquidBalance.toFixed(2)} ر.س</b></article>
      </section>

      <FinanceActions
        accounts={accountRows}
        canManage={canManage}
        canExpense={canExpense}
        canExpenseApprove={canExpenseApprove}
        canExpensePay={canExpensePay}
        canBankReconcile={canBankReconcile}
        canBankReview={canBankReview}
        canTransfer={canTransfer}
        canPosSettle={canPosSettle}
        canPaySupplier={canPaySupplier}
        expenseRequests={expenseRequests.map((expense) => ({
          id: expense.id,
          requestNo: expense.requestNo,
          accountName: expense.account.nameAr,
          category: expense.category,
          descriptionAr: expense.descriptionAr,
          amount: Number(expense.amount),
          recipientName: expense.recipientName,
          status: expense.status,
          isOwn: expense.requestedBy === session.userId,
        }))}
        reconciliations={reconciliations.map((item) => ({
          id: item.id,
          reconciliationNo: item.reconciliationNo,
          accountName: item.account.nameAr,
          statementDate: item.statementDate.toISOString(),
          systemBalance: Number(item.systemBalance),
          statementBalance: Number(item.statementBalance),
          difference: Number(item.difference),
          status: item.status,
          isOwn: item.preparedBy === session.userId,
        }))}
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
            <thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th>بيانات البنك</th><th>الرصيد</th></tr></thead>
            <tbody>
              {accountRows.map((account) => (
                <tr key={account.id}>
                  <td>{account.code}</td><td>{account.nameAr}</td><td>{typeLabel[account.type] ?? account.type}</td>
                  <td>
                    {account.type === "BANK" ? (
                      <div className="bankAccountCell">
                        <b>{account.bankName || "—"}</b>
                        <span dir="ltr">A/C {account.accountNumber || "—"}</span>
                        <span dir="ltr">IBAN {account.iban || "—"}</span>
                        {account.code === "BANK-MAIN" && (
                          <>
                            <small>شهادة IBAN رقم {companyConfig.bank.certificateReference} · {companyConfig.bank.certificateDate}</small>
                            <small>الرصيد الافتتاحي المعتمد: {companyConfig.bank.openingBalance.toFixed(2)} ر.س · كما في {companyConfig.bank.openingBalanceAsOf}</small>
                          </>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td><b>{account.balance.toFixed(2)} ر.س</b></td>
                </tr>
              ))}
              {accountRows.length === 0 && <tr><td colSpan={5} className="empty">لا توجد حسابات مالية.</td></tr>}
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
                  <td>{transaction.createdAt.toLocaleString("ar-SA-u-nu-latn")}</td>
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
