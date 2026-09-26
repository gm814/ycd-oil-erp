"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; code: string; nameAr: string; type: string; balance: number };
type SupplierInvoice = { id: string; invoiceNo: string; supplier: string; orderNo: string; total: number };

export default function FinanceActions({ accounts, invoices }: { accounts: Account[]; invoices: SupplierInvoice[] }) {
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
        INSUFFICIENT_FINANCIAL_BALANCE: "الرصيد غير كافٍ لتنفيذ السداد.",
        PAYMENT_APPROVAL_REQUIRED: "الفاتورة لم تعتمد للدفع.",
        FINANCIAL_ACCOUNT_CREATE_FAILED: "تعذر إنشاء الحساب؛ تحقق من الكود.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية بنجاح.");
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

  const paymentAccounts = accounts.filter((account) => account.type === "CASH" || account.type === "BANK");

  return (
    <>
      <section className="workGrid">
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
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
