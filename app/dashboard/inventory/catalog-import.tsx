"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CatalogImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function importCatalog() {
    if (!file || busy) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 1_000_000) throw new Error("الملف كبير جدًا");
      const response = await fetch("/api/secure/inventory/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر الاستيراد");
      setMessage(`تمت إضافة ${result.created} صنفًا غير نشط بانتظار التسعير، وتجاوز ${result.skipped} صنفًا موجودًا. لم تُضف أي أرصدة مخزون.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الاستيراد"); }
    finally { setBusy(false); }
  }
  return <article className="panel">
    <h2>استيراد دليل الأصناف</h2>
    <p>إضافة الأكواد والأسماء والتكاليف فقط من ملف JSON. الأصناف الجديدة غير نشطة حتى اعتماد أسعار البيع. الأصناف الموجودة وأرصدة المخزون لا تتغير.</p>
    <input aria-label="ملف الأصناف" type="file" accept=".json,application/json" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setMessage(""); }} />
    <button type="button" disabled={!file || busy} onClick={importCatalog}>{busy ? "جارٍ الاستيراد…" : "إضافة الأصناف فقط"}</button>
    {message && <p role="status">{message}</p>}
  </article>;
}
