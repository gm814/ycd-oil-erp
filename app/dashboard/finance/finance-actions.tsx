"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; code: string; nameAr: string; type: string; balance: number };
type SupplierInvoice = { id: string; invoiceNo: string; supplier: string; orderNo: string; total: number };
type ExpenseRequest = {
  id: string;
  requestNo: string;
  accountName: string;
  category: string;
  descriptionAr: string;
  amount: number;
  recipientName: string | null;
  status: string;
  isOwn: boolean;
};
type Reconciliation = {
  id: string;
  reconciliationNo: string;
  accountName: string;
  statementDate: string;
  systemBalance: number;
  statementBalance: number;
  difference: number;
  status: string;
  isOwn: boolean;
};

type Props = {
  accounts: Account[];
  invoices: SupplierInvoice[];
  expenseRequests: ExpenseRequest[];
  reconciliations: Reconciliation[];
  canManage: boolean;
  canExpense: boolean;
  canExpenseApprove: boolean;
  canExpensePay: boolean;
  canBankReconcile: boolean;
  canBankReview: boolean;
  canTransfer: boolean;
  canPosSettle: boolean;
  canPaySupplier: boolean;
};

const expenseStatus: Record<string, string> = {
  REQUESTED: "بانتظار الاعتماد",
  APPROVED: "معتمد بانتظار الصرف",
  REJECTED: "مرفوض",
  PAID: "تم الصرف",
  CANCELLED: "ملغي",
};

const reconciliationStatus: Record<string, string> = {
  DRAFT: "مسودة للمراجعة",
  REVIEWED: "تمت المراجعة",
  CLOSED: "مقفلة",
};

export default function FinanceActions({
  accounts,
  invoices,
  expenseRequests,
  reconciliations,
  canManage,
  canExpense,
  canExpenseApprove,
  canExpensePay,
  canBankReconcile,
  canBankReview,
  canTransfer,
  canPosSettle,
  canPaySupplier,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown, successMessage = "تم تنفيذ العملية وتسجيلها في سجل الرقابة.") {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const messages: Record<string, string> = {
        INSUFFICIENT_FINANCIAL_BALANCE: "الرصيد غير كافٍ لتنفيذ العملية.",
        INSUFFICIENT_POS_CLEARING_BALANCE: "رصيد تسويات مدى غير كافٍ.",
        PAYMENT_APPROVAL_REQUIRED: "الفاتورة لم تعتمد للدفع.",
        EXPENSE_APPROVAL_REQUIRED: "طلب المصروف لم يعتمد بعد.",
        EXPENSE_REQUEST_NOT_PENDING: "تم اتخاذ قرار سابق على طلب المصروف.",
        SELF_APPROVAL_NOT_ALLOWED: "لا يمكن لطالب المصروف اعتماد طلبه بنفسه.",
        SELF_REVIEW_NOT_ALLOWED: "لا يمكن لمعد المطابقة البنكية مراجعتها بنفسه.",
        RECONCILIATION_REVIEW_REQUIRED: "يجب مراجعة المطابقة قبل الإقفال.",
        RECONCILIATION_DIFFERENCE_REMAINS: "لا يمكن الإقفال ما دام هناك فرق في المطابقة.",
        FINANCIAL_ACCOUNT_CREATE_FAILED: "تعذر إنشاء الحساب؛ تحقق من الكود.",
        FINANCIAL_ACCOUNT_NOT_FOUND: "الحساب المالي غير موجود أو غير متاح لهذه العملية.",
        BANK_ACCOUNT_NOT_FOUND: "الحساب البنكي غير موجود.",
        IDEMPOTENCY_CONFLICT: "تم استخدام مرجع العملية سابقًا ببيانات مختلفة.",
        SAME_ACCOUNT: "يجب اختيار حساب مصدر وحساب وجهة مختلفين.",
        FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage(successMessage);
    router.refresh();
    return true;
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/finance/accounts", Object.fromEntries(new FormData(form).entries()), "تم إنشاء الحساب المالي.")
      .then((ok) => { if (ok) form.reset(); });
  }

  function payInvoice(event: FormEvent<HTMLFormElement>, invoiceId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void post(`/api/secure/procurement/supplier-invoices/${invoiceId}/pay`, {
      accountId: data.get("accountId"),
      reference: data.get("reference"),
      idempotencyReference: crypto.randomUUID(),
    }, "تم سداد فاتورة المورد وتسجيل الحركة المالية.").then((ok) => { if (ok) form.reset(); });
  }

  function requestExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/expenses", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }, "تم رفع طلب المصروف للاعتماد دون صرف أي مبلغ.").then((ok) => { if (ok) form.reset(); });
  }

  function decideExpense(id: string, decision: "APPROVE" | "REJECT") {
    void post(`/api/secure/finance/expense-requests/${id}/decision`, { decision }, decision === "APPROVE"
      ? "تم اعتماد طلب المصروف وأصبح جاهزًا للصرف."
      : "تم رفض طلب المصروف.");
  }

  function payExpense(id: string) {
    void post(`/api/secure/finance/expense-requests/${id}/pay`, {}, "تم صرف المصروف المعتمد وتسجيل الحركة المالية.");
  }

  function postTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/transfers", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }, "تم تنفيذ التحويل الداخلي وتسجيل طرفي الحركة.").then((ok) => { if (ok) form.reset(); });
  }

  function settlePos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/pos-settlements", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }, "تم تسجيل تسوية مدى وتحويل الصافي إلى البنك.").then((ok) => { if (ok) form.reset(); });
  }

  function prepareReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/finance/reconciliations", Object.fromEntries(new FormData(form).entries()), "تم إعداد المطابقة البنكية وحساب الفرق تلقائيًا.")
      .then((ok) => { if (ok) form.reset(); });
  }

  function reviewReconciliation(id: string, action: "REVIEW" | "CLOSE") {
    void post(`/api/secure/finance/reconciliations/${id}/review`, { action }, action === "REVIEW"
      ? "تمت مراجعة المطابقة البنكية."
      : "تم إقفال المطابقة البنكية بدون فرق.");
  }

  const paymentAccounts = accounts.filter((account) => account.type === "CASH" || account.type === "BANK");
  const posAccounts = accounts.filter((account) => account.type === "POS_CLEARING");
  const bankAccounts = accounts.filter((account) => account.type === "BANK");

  return (
    <>
      <section className="workGrid">
        {canExpense && (
          <article className="panel">
            <h2>طلب مصروف تشغيلي</h2>
            <p className="muted">الطلب لا يخصم من الصندوق أو البنك إلا بعد اعتماد مستقل ثم تنفيذ الصرف.</p>
            <form className="intakeForm" onSubmit={requestExpense}>
              <label>حساب الصرف المقترح
                <select name="accountId" required defaultValue="">
                  <option value="" disabled>اختر الصندوق / البنك</option>
                  {paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.nameAr} — {account.balance.toFixed(2)} ر.س</option>
                  ))}
                </select>
              </label>
              <div className="formRow">
                <label>التصنيف
                  <select name="category" defaultValue="SUPPLIES">
                    <option value="RENT">إيجار</option>
                    <option value="UTILITIES">خدمات ومرافق</option>
                    <option value="FUEL">وقود ونقل</option>
                    <option value="MAINTENANCE">صيانة</option>
                    <option value="SUPPLIES">مستلزمات تشغيل</option>
                    <option value="ADMIN">مصروفات إدارية</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </label>
                <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required /></label>
              </div>
              <label>البيان<input name="descriptionAr" required placeholder="وصف المصروف والغرض منه" /></label>
              <div className="formRow">
                <label>المستفيد<input name="recipientName" /></label>
                <label>رقم المستفيد<input name="recipientPhone" /></label>
              </div>
              <label>مرجع السند / الفاتورة<input name="reference" /></label>
              <button disabled={busy || paymentAccounts.length === 0}>رفع طلب المصروف للاعتماد</button>
            </form>
          </article>
        )}

        {canBankReconcile && (
          <article className="panel">
            <h2>إعداد مطابقة بنكية</h2>
            <form className="intakeForm" onSubmit={prepareReconciliation}>
              <label>الحساب البنكي
                <select name="accountId" required defaultValue="">
                  <option value="" disabled>اختر الحساب البنكي</option>
                  {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr}</option>)}
                </select>
              </label>
              <div className="formRow">
                <label>تاريخ كشف البنك<input name="statementDate" type="date" required /></label>
                <label>رصيد كشف البنك<input name="statementBalance" type="number" step="0.01" required /></label>
              </div>
              <div className="formRow">
                <label>مرجع الكشف<input name="reference" /></label>
                <label>ملاحظات<input name="notes" /></label>
              </div>
              <button disabled={busy || bankAccounts.length === 0}>حساب الفرق وحفظ المطابقة</button>
            </form>
          </article>
        )}
      </section>

      <section className="workGrid">
        {(canExpenseApprove || canExpensePay) && (
          <article className="panel">
            <h2>دورة اعتماد المصروفات</h2>
            {expenseRequests.map((expense) => (
              <div key={expense.id} className="paymentCard">
                <div>
                  <b>{expense.requestNo} — {expense.descriptionAr}</b>
                  <span>{expense.accountName} · {expense.amount.toFixed(2)} ر.س · {expenseStatus[expense.status] ?? expense.status}</span>
                  {expense.recipientName && <span>المستفيد: {expense.recipientName}</span>}
                </div>
                <div className="actionStack">
                  {expense.status === "REQUESTED" && canExpenseApprove && !expense.isOwn && (
                    <>
                      <button disabled={busy} onClick={() => decideExpense(expense.id, "APPROVE")}>اعتماد</button>
                      <button className="secondaryButton" disabled={busy} onClick={() => decideExpense(expense.id, "REJECT")}>رفض</button>
                    </>
                  )}
                  {expense.status === "REQUESTED" && expense.isOwn && <span className="muted">بانتظار اعتماد مستخدم آخر</span>}
                  {expense.status === "APPROVED" && canExpensePay && (
                    <button disabled={busy} onClick={() => payExpense(expense.id)}>تنفيذ الصرف</button>
                  )}
                </div>
              </div>
            ))}
            {expenseRequests.length === 0 && <p className="empty">لا توجد طلبات مصروفات.</p>}
          </article>
        )}

        {canBankReview && (
          <article className="panel">
            <h2>مراجعة المطابقات البنكية</h2>
            {reconciliations.map((item) => (
              <div key={item.id} className="paymentCard">
                <div>
                  <b>{item.reconciliationNo} — {item.accountName}</b>
                  <span>{new Date(item.statementDate).toLocaleDateString("ar-SA-u-nu-latn")} · النظام {item.systemBalance.toFixed(2)} · البنك {item.statementBalance.toFixed(2)} ر.س</span>
                  <span className={Math.abs(item.difference) > 0.01 ? "moneyOut" : "moneyIn"}>الفرق: {item.difference.toFixed(2)} ر.س · {reconciliationStatus[item.status] ?? item.status}</span>
                </div>
                <div className="actionStack">
                  {item.status === "DRAFT" && !item.isOwn && (
                    <button disabled={busy} onClick={() => reviewReconciliation(item.id, "REVIEW")}>مراجعة</button>
                  )}
                  {item.status === "DRAFT" && item.isOwn && <span className="muted">بانتظار مراجع مستقل</span>}
                  {item.status === "REVIEWED" && Math.abs(item.difference) <= 0.01 && !item.isOwn && (
                    <button disabled={busy} onClick={() => reviewReconciliation(item.id, "CLOSE")}>إقفال المطابقة</button>
                  )}
                  {item.status === "REVIEWED" && Math.abs(item.difference) > 0.01 && (
                    <span className="moneyOut">يلزم معالجة الفرق قبل الإقفال</span>
                  )}
                </div>
              </div>
            ))}
            {reconciliations.length === 0 && <p className="empty">لا توجد مطابقات بنكية بعد.</p>}
          </article>
        )}
      </section>

      <section className="workGrid">
        {canTransfer && (
          <article className="panel">
            <h2>تحويل بين الصندوق والبنك</h2>
            <form className="intakeForm" onSubmit={postTransfer}>
              <label>من حساب
                <select name="sourceAccountId" required defaultValue="">
                  <option value="" disabled>اختر حساب المصدر</option>
                  {paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.nameAr} — {account.balance.toFixed(2)} ر.س</option>
                  ))}
                </select>
              </label>
              <label>إلى حساب
                <select name="destinationAccountId" required defaultValue="">
                  <option value="" disabled>اختر حساب الوجهة</option>
                  {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr}</option>)}
                </select>
              </label>
              <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required /></label>
              <div className="formRow">
                <label>المرجع<input name="reference" placeholder="رقم الإيداع / التحويل" /></label>
                <label>ملاحظات<input name="notes" /></label>
              </div>
              <button disabled={busy || paymentAccounts.length < 2}>تنفيذ التحويل</button>
            </form>
          </article>
        )}

        {canPosSettle && (
          <article className="panel">
            <h2>تسوية مدى / الشبكة إلى البنك</h2>
            <form className="intakeForm" onSubmit={settlePos}>
              <div className="formRow">
                <label>حساب تسويات مدى
                  <select name="posAccountId" required defaultValue="">
                    <option value="" disabled>اختر حساب مدى</option>
                    {posAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.nameAr} — {account.balance.toFixed(2)} ر.س</option>
                    ))}
                  </select>
                </label>
                <label>الحساب البنكي المستلم
                  <select name="bankAccountId" required defaultValue="">
                    <option value="" disabled>اختر البنك</option>
                    {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr}</option>)}
                  </select>
                </label>
              </div>
              <div className="formRow">
                <label>إجمالي التسوية<input name="grossAmount" type="number" min="0.01" step="0.01" required /></label>
                <label>رسوم البنك / الشبكة<input name="feeAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
              </div>
              <div className="formRow">
                <label>مرجع التسوية<input name="reference" required placeholder="رقم دفعة التسوية" /></label>
                <label>ملاحظات<input name="notes" /></label>
              </div>
              <button disabled={busy || posAccounts.length === 0 || bankAccounts.length === 0}>تسجيل تسوية مدى</button>
            </form>
          </article>
        )}
      </section>

      <section className="workGrid">
        {canManage && (
          <article className="panel">
            <h2>إنشاء حساب مالي</h2>
            <form className="intakeForm" onSubmit={createAccount}>
              <div className="formRow">
                <label>كود الحساب<input name="code" required /></label>
                <label>اسم الحساب<input name="nameAr" required /></label>
              </div>
              <label>النوع
                <select name="type" defaultValue="BANK">
                  <option value="CASH">صندوق نقدي</option>
                  <option value="BANK">حساب بنكي</option>
                  <option value="POS_CLEARING">تسويات شبكة / POS</option>
                </select>
              </label>
              <div className="formRow">
                <label>اسم البنك<input name="bankName" /></label>
                <label>رقم الحساب<input name="accountNumber" dir="ltr" /></label>
              </div>
              <label>IBAN<input name="iban" dir="ltr" placeholder="SA..." /></label>
              <label>الرصيد الافتتاحي<input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <button disabled={busy}>حفظ الحساب</button>
            </form>
          </article>
        )}

        {canPaySupplier && (
          <article className="panel">
            <h2>فواتير معتمدة للدفع</h2>
            {invoices.map((invoice) => (
              <form key={invoice.id} className="intakeForm paymentCard" onSubmit={(event) => payInvoice(event, invoice.id)}>
                <div><b>{invoice.invoiceNo} — {invoice.supplier}</b><span>{invoice.orderNo} · {invoice.total.toFixed(2)} ر.س</span></div>
                <label>حساب السداد
                  <select name="accountId" required defaultValue="">
                    <option value="" disabled>اختر الصندوق / البنك</option>
                    {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr} — رصيد {account.balance.toFixed(2)}</option>)}
                  </select>
                </label>
                <label>مرجع السداد<input name="reference" placeholder="رقم التحويل / السند" /></label>
                <button disabled={busy || paymentAccounts.length === 0}>تنفيذ السداد</button>
              </form>
            ))}
            {invoices.length === 0 && <p className="empty">لا توجد فواتير موردين معتمدة للدفع.</p>}
          </article>
        )}
      </section>

      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
