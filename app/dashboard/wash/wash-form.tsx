"use client";
import { FormEvent, ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
const messages: Record<string, string> = {
  CASH_DRAWER_RESTRICTED: "درج الكاشير للتحصيل فقط. اختر صندوق الإدارة أو البنك لصرف مستحق المغسلة.",
  TREASURY_REQUIRED: "اختر صندوق الإدارة المعتمد أو حسابًا بنكيًا لسداد المطالبة.",
  FORBIDDEN: "لا تملك صلاحية هذا الإجراء أو أنه يخص فرعًا آخر.",
  INVALID_INPUT: "راجع الحقول المطلوبة وصيغة المبالغ.", INVALID_AMOUNT: "أدخل مبلغًا موجبًا بحد أقصى منزلتين عشريتين.",
  WASH_AGREEMENT_REQUIRED: "يجب إعداد اتفاق تسوية بين المركز وفرع المغسلة قبل استخدام الكوبون.",
  COUPON_NOT_FOUND: "الكوبون غير موجود.", COUPON_NOT_ACTIVE: "الكوبون مستخدم أو غير فعال.", COUPON_EXPIRED: "انتهت صلاحية الكوبون.",
  INVOICE_REVIEW_REQUIRED: "الفاتورة ملغاة أو عليها مرتجع؛ راجع الإدارة قبل تقديم الخدمة.",
  BRANCH_NOT_LIVE: "التشغيل التجاري للفرع غير مفعّل.", VALUATION_REQUIRED: "توجد خدمات دون قيمة تسوية معتمدة. استكمل تسعيرها أولًا.",
  NO_COMPLETED_SERVICES: "لا توجد خدمات مكتملة غير مرفوعة لهذا اليوم.", INVALID_DATE: "اختر تاريخًا صحيحًا حتى اليوم.",
  INDEPENDENT_REVIEW_REQUIRED: "يجب اعتماد المطالبة بواسطة مستخدم آخر غير الذي رفعها.",
  BATCH_NOT_SUBMITTED: "المطالبة لم تعد بانتظار الاعتماد.", BATCH_NOT_POSTED: "اعتمد ورحّل المطالبة قبل السداد.",
  PAYMENT_EXCEEDS_BALANCE: "المبلغ أكبر من الرصيد المتبقي للمطالبة.", INVALID_ACCOUNTS: "اختر حسابي صرف وقبض مختلفين ونشطين للفرعين المحددين.",
  INSUFFICIENT_FUNDS: "رصيد حساب الصرف لا يغطي المبلغ.", SERVICE_ALREADY_BATCHED: "لا يمكن تغيير قيمة خدمة بعد رفعها؛ أعد المطالبة للمراجعة أولًا.",
  AGREEMENT_BRANCH_LOCKED: "لا يمكن تغيير فرع المغسلة بعد تسجيل خدمات على الاتفاق.",
  CONCURRENT_CHANGE: "تغيرت البيانات أثناء التنفيذ. حدّث الصفحة وراجع النتيجة قبل المحاولة مجددًا.",
  IDEMPOTENCY_CONFLICT: "مرجع العملية مستخدم لبيانات مختلفة. حدّث الصفحة وراجع العملية السابقة.",
  UNAUTHENTICATED: "انتهت الجلسة؛ سجل الدخول مجددًا.",
};
export default function WashForm({ action, values = {}, label, children, confirm }: { action: string; values?: Record<string, string>; label: string; children?: ReactNode; confirm?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const pending = useRef<{ body: string; key: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || (confirm && !window.confirm(confirm))) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (data.unitAmount === "") delete data.unitAmount;
    const body = JSON.stringify({ action, ...values, ...data });
    if (!pending.current || pending.current.body !== body) pending.current = { body, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/secure/wash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), key: pending.current.key }) });
      const result = await r.json();
      if (!r.ok) { setMessage(messages[result.error] ?? "تعذر تنفيذ الإجراء. راجع البيانات والصلاحيات."); return; }
      setMessage(result.serviceNo ? `تم فتح خدمة الغسيل ${result.serviceNo}` : "تم تنفيذ الإجراء وتسجيله بنجاح."); pending.current = null; router.refresh();
    } catch { setMessage("تعذر التأكد من الحفظ بسبب الاتصال. راجع القائمة قبل إعادة الإرسال؛ يحتفظ النموذج بمرجع المحاولة لمنع تكرار المطالبات والسداد."); }
    finally { setBusy(false); }
  }
  return <form className="intakeForm" onSubmit={submit}>{children}<button disabled={busy}>{busy ? "جارٍ التنفيذ..." : label}</button>{message && <p className="formNotice" role="status">{message}</p>}</form>;
}
