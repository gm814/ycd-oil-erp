"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; code: string; nameAr: string; type: string; balance: number };
type SupplierInvoice = { id: string; invoiceNo: string; supplier: string; orderNo: string; total: number };

type Props = {
  accounts: Account[];
  invoices: SupplierInvoice[];
  canManage: boolean;
  canExpense: boolean;
  canTransfer: boolean;
  canPosSettle: boolean;
  canPaySupplier: boolean;
};

export default function FinanceActions({
  accounts,
  invoices,
  canManage,
  canExpense,
  canTransfer,
  canPosSettle,
  canPaySupplier,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
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
        FINANCIAL_ACCOUNT_CREATE_FAILED: "تعذر إنشاء الحساب؛ تحقق من الكود.",
        FINANCIAL_ACCOUNT_NOT_FOUND: "الحساب المالي غير موجود أو غير متاح لهذه العملية.",
        IDEMPOTENCY_CONFLICT: "تم استخدام مرجع العملية سابقًا ببيانات مختلفة.",
        SAME_ACCOUNT: "يجب اختيار حساب مصدر وحساب وجهة مختلفين.",
        FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية وتسجيلها في الحركة المالية وسجل الرقابة.");
    router.refresh();
    return true;
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/finance/accounts", Object.fromEntries(new FormData(form).entries()))
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
    }).then((ok) => { if (ok) form.reset(); });
  }

  function postExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/expenses", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }).then((ok) => { if (ok) form.reset(); });
  }

  function postTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/transfers", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }).then((ok) => { if (ok) form.reset(); });
  }

  function settlePos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/pos-settlements", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }).then((ok) => { if (ok) form.reset(); });
  }

  const paymentAccounts = accounts.filter((account) => account.type === "CASH" || account.type === "BANK");
  const posAccounts = accounts.filter((account) => account.type === "POS_CLEARING");
  const bankAccounts = accounts.filter((account) => account.type === "BANK");

  return (
    <>
      <section className="workGrid">
        {canExpense && (
          <article className="panel">
            <h2>تسجيل مصروف تشغيلي</h2>
            <form className="intakeForm" onSubmit={postExpense}>
              <label>حساب الصرف
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
              <button disabled={busy || paymentAccounts.length === 0}>تسجيل وصرف المصروف</button>
            </form>
          </article>
        )}

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
      </section>

      {canPosSettle && (
        <article className="panel inventoryPanel">
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
                <label>IBAN<input name="iban" /></label>
              </div>
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
