"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OrderActions({ orderId, locked }: { orderId: string; locked: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());

    const response = await fetch(`/api/secure/service-orders/${orderId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setBusy(false);
    if (!response.ok) {
      setMessage("تعذر إضافة البند.");
      return;
    }
    formElement.reset();
    setMessage("تمت إضافة البند.");
    router.refresh();
  }

  async function complete() {
    if (!confirm("تأكيد إقفال أمر الخدمة وإصدار الفاتورة وتسجيل الدفع؟")) return;
    setBusy(true);
    setMessage("");
    const idempotencyReference = crypto.randomUUID();
    const response = await fetch(`/api/secure/service-orders/${orderId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentMethod: "CASH",
        idempotencyReference,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "INSUFFICIENT_STOCK" ? "المخزون غير كافٍ لإقفال الأمر." : "تعذر إقفال أمر الخدمة.");
      return;
    }
    setMessage(`تم إصدار الفاتورة ${result.invoice.invoiceNo}`);
    router.refresh();
  }

  if (locked) return <p className="empty">أمر الخدمة مقفل ولا يقبل تعديلات إضافية.</p>;

  return (
    <>
      <form className="intakeForm" onSubmit={addItem}>
        <label>وصف الخدمة / المادة<input name="descriptionAr" required /></label>
        <div className="formRow">
          <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label>
          <label>سعر الوحدة<input name="unitPrice" type="number" min="0" step="0.01" required /></label>
        </div>
        <label>الخصم<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <button type="submit" disabled={busy}>إضافة البند</button>
      </form>
      <hr className="divider" />
      <button className="completeButton" type="button" disabled={busy} onClick={complete}>إقفال الخدمة وإصدار الفاتورة — نقدًا</button>
      {message && <p className="formNotice">{message}</p>}
    </>
  );
}
