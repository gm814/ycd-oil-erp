"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; nameAr: string; balance: number };

export default function PayrollActions({ payrollId, status, total, accounts }: { payrollId: string; status: string; total: number; accounts: Account[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown = {}) {
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
        SEPARATE_APPROVER_REQUIRED: "يجب أن يعتمد المسير مستخدم مختلف عن مُعد المسير.",
        PAYROLL_NOT_APPROVED: "يجب اعتماد المسير قبل الصرف.",
        INSUFFICIENT_FINANCIAL_BALANCE: "رصيد الحساب المالي غير كافٍ لصرف الرواتب.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return;
    }
    setMessage("تم تنفيذ العملية وتسجيلها رقابيًا.");
    router.refresh();
  }

  function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void post(`/api/secure/hr/payroll/${payrollId}/pay`, {
      accountId: data.get("accountId"),
      reference: data.get("reference"),
      idempotencyReference: crypto.randomUUID(),
    });
  }

  return (
    <section className="workGrid">
      <article className="panel">
        <h2>اعتماد وصرف المسير</h2>
        {status === "DRAFT" && <button disabled={busy} onClick={() => void post(`/api/secure/hr/payroll/${payrollId}/approve`)}>اعتماد مسير الرواتب</button>}
        {status === "APPROVED" && (
          <form className="intakeForm" onSubmit={pay}>
            <p>المبلغ المعتمد للصرف: <b>{total.toFixed(2)} ر.س</b></p>
            <label>حساب الصرف<select name="accountId" required defaultValue=""><option value="" disabled>اختر الصندوق / البنك</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr} — رصيد {account.balance.toFixed(2)} ر.س</option>)}</select></label>
            <label>مرجع التحويل / سند الصرف<input name="reference" required /></label>
            <button disabled={busy || accounts.length === 0}>تسجيل صرف الرواتب</button>
          </form>
        )}
        {status === "PAID" && <p className="formNotice">تم صرف المسير وتسجيل الحركة المالية.</p>}
        {message && <p className="formNotice">{message}</p>}
      </article>
    </section>
  );
}
