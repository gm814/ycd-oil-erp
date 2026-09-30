"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function CouponRedeem() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const serial = String(new FormData(form).get("serial") || "").trim().toUpperCase();
    try {
    const response = await fetch("/api/secure/coupons/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serial }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const messages: Record<string, string> = {
        WASH_AGREEMENT_REQUIRED: "أكمل إعداد اتفاق المغسلة من صفحة كوبونات وتسويات الغسيل.",
        INVOICE_REVIEW_REQUIRED: "راجع الإدارة؛ الفاتورة عليها مرتجع أو ملغاة.",
        BRANCH_NOT_LIVE: "التشغيل التجاري غير مفعل.",
        COUPON_NOT_FOUND: "الكوبون غير موجود.",
        COUPON_NOT_ACTIVE: "الكوبون مستخدم أو غير فعال.",
        COUPON_EXPIRED: "انتهت صلاحية الكوبون.",
      };
      setMessage(messages[result.error] || "تعذر استخدام الكوبون.");
      return;
    }
    setMessage(`تم فتح خدمة الغسيل ${result.serviceNo}. أكملها من صفحة خدمات الغسيل.`);
    form.reset();
    router.refresh();
    } catch { setMessage("تعذر التأكد من نتيجة العملية. راجع خدمات الغسيل قبل إعادة المحاولة."); } finally { setBusy(false); }
  }

  return (
    <form className="intakeForm" onSubmit={submit}>
      <label>رقم الكوبون<input name="serial" required placeholder="WASH-..." /></label>
      <button disabled={busy}>تحقق واستخدم الكوبون</button>
      {message && <p className="formNotice">{message}</p>}
    </form>
  );
}
