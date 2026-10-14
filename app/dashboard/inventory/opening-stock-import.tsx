"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OpeningStockImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function importStock() {
    if (!file || busy) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 1_000_000) throw new Error("الملف كبير جدًا");
      const response = await fetch("/api/secure/inventory/opening-stock", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر الاستيراد");
      setMessage(`تم تسجيل ${result.created} رصيدًا افتتاحيًا مؤقتًا بإجمالي ${result.quantity} وحدة، وتجاوز ${result.skipped} رصيدًا مسجلًا سابقًا. المبيعات اللاحقة للكشف بانتظار التسوية.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الاستيراد"); }
    finally { setBusy(false); }
  }
  return <article className="panel">
    <h2>استيراد رصيد افتتاحي مؤقت</h2>
    <p>إضافة كميات الكشف للفرع الحالي، مع تأجيل تسوية المبيعات اللاحقة للكشف. تبقى العمليات المسجلة والأسعار كما هي. إعادة رفع الملف نفسه لا تكرر الأرصدة.</p>
    <input aria-label="ملف الرصيد الافتتاحي" type="file" accept=".json,application/json" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setMessage(""); }} />
    <button type="button" disabled={!file || busy} onClick={importStock}>{busy ? "جارٍ الاستيراد…" : "إدخال الأرصدة الافتتاحية المؤقتة"}</button>
    {message && <p role="status">{message}</p>}
  </article>;
}
