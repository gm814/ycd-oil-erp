"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function CollectionForm({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");

    const response = await fetch(`/api/secure/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: data.get("method"),
        amount: Number(data.get("amount")),
        reference: String(data.get("reference") || "").trim() || undefined,
        idempotencyReference: crypto.randomUUID(),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      const errors: Record<string, string> = {
        PAYMENT_EXCEEDS_BALANCE: "مبلغ التحصيل أكبر من الرصيد المتبقي.",
        OPEN_SHIFT_REQUIRED: "يلزم فتح وردية للتحصيل النقدي أو عبر الشبكة.",
        FINANCIAL_ACCOUNT_REQUIRED: "لا يوجد حساب مالي مناسب لطريقة التحصيل.",
        INVOICE_ALREADY_PAID: "الفاتورة مسددة بالكامل.",
        INVOICE_VOID: "لا يمكن التحصيل على فاتورة ملغاة.",
      };
      setMessage(errors[result.error] || "تعذر تسجيل التحصيل.");
      return;
    }

    form.reset();
    setMessage("تم تسجيل التحصيل وتحديث رصيد الفاتورة.");
    router.refresh();
  }

  return (
    <form className="collectionForm" onSubmit={submit}>
      <h3>تسجيل تحصيل على الفاتورة</h3>
      <div className="formRow">
        <label>المبلغ
          <input name="amount" type="number" min="0.01" max={remaining} step="0.01" defaultValue={remaining.toFixed(2)} required />
        </label>
        <label>طريقة التحصيل
          <select name="method" defaultValue="CASH">
            <option value="CASH">نقدي</option>
            <option value="CARD">مدى / شبكة / بطاقة</option>
            <option value="TRANSFER">تحويل بنكي</option>
          </select>
        </label>
      </div>
      <label>مرجع العملية<input name="reference" maxLength={120} placeholder="رقم الشبكة / الحوالة / السند" /></label>
      <button disabled={busy}>تسجيل التحصيل</button>
      {message && <p className="formNotice">{message}</p>}
    </form>
  );
}
