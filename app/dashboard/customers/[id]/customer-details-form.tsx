"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_PHONE_ERROR, isCustomerPhone, normalizeCustomerPhone } from "@/lib/customer-phone";

export default function CustomerDetailsForm({ customerId, name, phone }: { customerId: string; name: string; phone: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const nextPhone = normalizeCustomerPhone(String(data.get("phone") ?? ""));
    if (!isCustomerPhone(nextPhone)) { setMessage(CUSTOMER_PHONE_ERROR); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/secure/customers/${customerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: String(data.get("name") ?? ""), phone: nextPhone, previousName: name, previousPhone: phone }) });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error === "INVALID_CUSTOMER_PHONE" ? CUSTOMER_PHONE_ERROR : result.error === "STALE_CUSTOMER" ? "تغيرت بيانات العميل؛ حدّث الصفحة ثم راجع التعديل." : "تعذر حفظ بيانات العميل. راجع البيانات والصلاحيات.");
        return;
      }
      setMessage("تم حفظ بيانات العميل."); router.refresh();
    } catch { setMessage("تعذر التأكد من الحفظ. حدّث الصفحة للتحقق من بيانات العميل."); }
    finally { setBusy(false); }
  }
  return <article className="panel"><h2>تعديل بيانات العميل</h2><form className="intakeForm" onSubmit={submit}>
    <label>اسم العميل<input name="name" defaultValue={name} required minLength={2} maxLength={120} /></label>
    <label>رقم الجوال<input name="phone" defaultValue={phone ?? ""} required inputMode="numeric" dir="ltr" pattern="[0-9٠-٩۰-۹]{10}" title={CUSTOMER_PHONE_ERROR} aria-describedby="customer-phone-help" /></label>
    <small id="customer-phone-help">أدخل 10 أرقام بالضبط، دون مسافات أو رمز الدولة.</small>
    {message && <p role="status">{message}</p>}
    <button disabled={busy} type="submit">{busy ? "جارٍ الحفظ…" : "حفظ بيانات العميل"}</button>
  </form></article>;
}
