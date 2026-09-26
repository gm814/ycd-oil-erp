"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; nameAr: string; balance: number };

export default function CustodyActions({
  custodyId, status, requestedAmount, approvedAmount, remaining, accounts,
}: {
  custodyId: string;
  status: string;
  requestedAmount: number;
  approvedAmount: number;
  remaining: number;
  accounts: Account[];
}) {
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
        SEPARATE_APPROVER_REQUIRED: "لا يجوز اعتماد الطلب بواسطة نفس المستخدم الذي أنشأه.",
        APPROVED_AMOUNT_EXCEEDS_REQUEST: "المبلغ المعتمد لا يمكن أن يتجاوز المبلغ المطلوب.",
        INSUFFICIENT_FINANCIAL_BALANCE: "رصيد الصندوق أو الحساب البنكي غير كافٍ.",
        INVALID_SETTLEMENT: "أدخل قيمة التسوية، واربط المصروف بمرجع مستند.",
        SETTLEMENT_EXCEEDS_CUSTODY: "التسوية تتجاوز رصيد العهدة.",
        FULL_SETTLEMENT_REQUIRED: "يجب تسوية كامل العهدة قبل الإقفال.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية وتسجيلها في سجل الرقابة.");
    router.refresh();
    return true;
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void post(`/api/secure/custody/requests/${custodyId}/approve`, {
      approvedAmount: data.get("approvedAmount"),
      notes: data.get("notes"),
    });
  }

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void post(`/api/secure/custody/requests/${custodyId}/issue`, {
      accountId: data.get("accountId"),
      reference: data.get("reference"),
    });
  }

  function settle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void post(`/api/secure/custody/requests/${custodyId}/settle`, {
      expenseAmount: data.get("expenseAmount"),
      returnedAmount: data.get("returnedAmount"),
      documentReference: data.get("documentReference"),
      notes: data.get("notes"),
    }).then((ok) => { if (ok) form.reset(); });
  }

  return (
    <div className="actionStack">
      {status === "REQUESTED" && (
        <form className="intakeForm procurementAction" onSubmit={approve}>
          <h3>اعتماد العهدة</h3>
          <label>المبلغ المعتمد<input name="approvedAmount" type="number" min="0.01" max={requestedAmount} step="0.01" defaultValue={requestedAmount.toFixed(2)} required /></label>
          <label>ملاحظات الاعتماد<input name="notes" /></label>
          <button disabled={busy}>اعتماد الطلب</button>
        </form>
      )}

      {status === "APPROVED" && (
        <form className="intakeForm procurementAction" onSubmit={issue}>
          <h3>إثبات صرف العهدة — {approvedAmount.toFixed(2)} ر.س</h3>
          <label>مصدر الصرف
            <select name="accountId" required defaultValue="">
              <option value="" disabled>اختر الصندوق / البنك</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr} — رصيد {account.balance.toFixed(2)} ر.س</option>)}
            </select>
          </label>
          <label>مرجع سند الصرف<input name="reference" required /></label>
          <button disabled={busy || accounts.length === 0}>تسجيل إثبات الصرف</button>
        </form>
      )}

      {(status === "DISBURSED" || status === "PARTIALLY_SETTLED") && (
        <form className="intakeForm procurementAction" onSubmit={settle}>
          <h3>تسوية العهدة — المتبقي {remaining.toFixed(2)} ر.س</h3>
          <div className="formRow">
            <label>مصروف بمستند<input name="expenseAmount" type="number" min="0" max={remaining} step="0.01" defaultValue="0" /></label>
            <label>مبلغ مسترد<input name="returnedAmount" type="number" min="0" max={remaining} step="0.01" defaultValue="0" /></label>
          </div>
          <label>مرجع الفاتورة / المستند<input name="documentReference" /></label>
          <label>ملاحظات<input name="notes" /></label>
          <button disabled={busy}>تسجيل التسوية</button>
        </form>
      )}

      {status === "SETTLED" && (
        <button className="secondaryButton" disabled={busy} onClick={() => void post(`/api/secure/custody/requests/${custodyId}/close`)}>إقفال العهدة نهائيًا</button>
      )}

      {status === "CLOSED" && <p className="formNotice">العهدة مقفلة ومكتملة التسوية.</p>}
      {message && <p className="formNotice">{message}</p>}
    </div>
  );
}
