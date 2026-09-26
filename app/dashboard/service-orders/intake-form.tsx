"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function IntakeForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());

    const response = await fetch("/api/secure/service-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage("تعذر فتح أمر الخدمة. راجع البيانات والصلاحيات.");
      return;
    }

    setMessage(`تم فتح أمر الخدمة: ${result.order.orderNo}`);
    formElement.reset();
    router.refresh();
  }

  return (
    <form className="intakeForm" onSubmit={submit}>
      <label>اسم العميل<input name="customerName" required /></label>
      <label>رقم الجوال<input name="phone" inputMode="tel" /></label>
      <label>رقم اللوحة<input name="plate" required /></label>
      <div className="formRow">
        <label>الشركة المصنعة<input name="make" placeholder="Toyota" /></label>
        <label>الموديل<input name="model" /></label>
      </div>
      <div className="formRow">
        <label>سنة الصنع<input name="year" type="number" min="1950" max="2100" /></label>
        <label>قراءة العداد<input name="odometer" type="number" min="0" /></label>
      </div>
      {message && <p className="formNotice">{message}</p>}
      <button type="submit" disabled={loading}>{loading ? "جارٍ فتح الأمر..." : "فتح أمر خدمة"}</button>
    </form>
  );
}
