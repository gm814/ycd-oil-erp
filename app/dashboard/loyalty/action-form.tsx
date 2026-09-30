"use client";
import { useState, useRef, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export default function ActionForm({ endpoint = "loyalty", action, values = {}, label, children }: { endpoint?: string; action: string; values?: Record<string, string>; label: string; children?: ReactNode }) {
  const requestKey = useRef({ body: "", key: "" }); const router = useRouter(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setNotice("");
    try {
      const fields = { ...Object.fromEntries(new FormData(event.currentTarget)), ...values, action };
      const serialized = JSON.stringify(fields);
      if (requestKey.current.body !== serialized) requestKey.current = { body: serialized, key: crypto.randomUUID() };
      const response = await fetch(`/api/secure/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, idempotencyKey: requestKey.current.key }) });
      const body = await response.json();
      if (!response.ok) { const errors: Record<string,string> = { INTERNATIONAL_PHONE_REQUIRED: "يلزم جوال بصيغة دولية يبدأ بعلامة + ورمز الدولة.", FORBIDDEN: "ليست لديك الصلاحية المطلوبة.", LOYALTY_BALANCE_LOW: "لم يكتمل رصيد الغسلات المطلوبة.", EMPTY_OPEN_ORDER_REQUIRED: "استخدم الغسلة المجانية قبل إضافة أي بنود لأمر مفتوح.", PROGRAM_UNAVAILABLE: "برنامج الولاء غير مفعّل أو الخدمة غير متاحة.", SERVICE_PRODUCT_REQUIRED: "اختر خدمة فعالة لها سعر من دليل الأصناف.", INVALID_INPUT: "راجع الحقول المطلوبة.", CONCURRENT_CHANGE: "تغيرت البيانات؛ حدّث الصفحة وراجع النتيجة.", CUSTOMER_NOT_FOUND: "العميل غير مسجل بهذا الفرع." }; setNotice(errors[body.error] ?? "تعذر الحفظ. حدّث الصفحة وراجع البيانات."); return; }
      setNotice("تم الحفظ بنجاح."); router.refresh();
    } catch { setNotice("تعذر تأكيد الحفظ. حدّث الصفحة قبل المحاولة مجددًا."); } finally { setBusy(false); }
  }
  return <form className="intakeForm" onSubmit={submit}>{children}<button disabled={busy}>{busy ? "جارٍ الحفظ…" : label}</button>{notice && <p role="status">{notice}</p>}</form>;
}
