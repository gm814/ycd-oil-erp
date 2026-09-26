"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const missingLabel: Record<string, string> = {
  EMPLOYEES: "الموظفون",
  USER_ACCOUNTS: "حسابات دخول الموظفين",
  USER_ROLE_PLAN: "مطابقة أدوار المستخدمين مع المسؤوليات المعتمدة",
  BANK_ACCOUNT: "الحساب البنكي",
  OPENING_BANK_BALANCE: "الرصيد البنكي الافتتاحي",
  FUNDING_SOURCE: "مصدر التمويل",
  PREOPENING_LEDGER_RECONCILIATION: "مطابقة سجل تكاليف ما قبل التشغيل",
  PRODUCT_CATALOG: "دليل الأصناف",
  SERVICE_CATALOG: "دليل الخدمات والأسعار",
  OPENING_STOCK: "الجرد الافتتاحي",
  SUPPLIERS: "الموردون",
  OPEN_SHIFT: "إقفال الوردية المفتوحة",
};

export default function GoLiveControl({
  canGoLive,
  status,
}: {
  canGoLive: boolean;
  status: "PREOPENING" | "LIVE" | "SUSPENDED";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!canGoLive) return null;
  if (status === "LIVE") return <p className="okBadge">الفرع في وضع التشغيل التجاري LIVE</p>;
  if (status === "SUSPENDED") return <p className="alertBadge">الفرع موقوف تشغيليًا</p>;

  async function activate() {
    if (!window.confirm("تفعيل التشغيل التجاري سيتيح فتح الورديات الحقيقية. هل تريد تنفيذ فحص الجاهزية ومحاولة التفعيل؟")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/secure/readiness/go-live", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      if (result.error === "GO_LIVE_REQUIREMENTS_INCOMPLETE" && Array.isArray(result.missing)) {
        setMessage("لا يمكن التفعيل بعد. البنود المتبقية: " + result.missing.map((code: string) => missingLabel[code] ?? code).join("، "));
      } else {
        setMessage("تعذر تفعيل التشغيل التجاري حتى تكتمل متطلبات الجاهزية.");
      }
      return;
    }

    setMessage("تم تفعيل التشغيل التجاري للفرع وتسجيل القرار في سجل التدقيق.");
    router.refresh();
  }

  return (
    <div className="goLiveControl">
      <button type="button" disabled={busy} onClick={activate}>
        {busy ? "جارٍ فحص الجاهزية..." : "فحص الجاهزية وتفعيل التشغيل التجاري"}
      </button>
      {message && <p className="formNotice">{message}</p>}
    </div>
  );
}
