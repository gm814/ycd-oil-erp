"use client";

import { useEffect, useState } from "react";

export default function PrintButton({ invoiceId }: { invoiceId: string }) {
  const [format, setFormat] = useState("a4");
  const [busy, setBusy] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => { setPdfFile(null); setPdfUrl(""); setNotice(""); }, [format]);

  async function downloadPdf() {
    setBusy(true); setNotice("يجري تجهيز ملف الفاتورة…");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf?format=${format}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("PDF_FAILED");
      const blob = await response.blob();
      const name = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || `invoice-${format}.pdf`;
      setPdfFile(new File([blob], name, { type: "application/pdf" }));
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setNotice("تم طلب تنزيل الفاتورة. إذا طلب المتصفح تأكيد التنزيل فوافق عليه. إذا لم يبدأ، استخدم حفظ ملف PDF بالجهاز.");
    } catch { setNotice("تعذر تجهيز الملف. تأكد من تسجيل الدخول ثم حاول مجددًا."); }
    finally { setBusy(false); }
  }

  async function sharePdf() {
    if (!pdfFile) return;
    if (!navigator.canShare?.({ files: [pdfFile] })) {
      setNotice("احفظ ملف PDF أولًا، ثم شاركه من تطبيق الملفات."); return;
    }
    try { await navigator.share({ files: [pdfFile], title: "فاتورة YCD OIL" }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setNotice("تعذرت المشاركة. يمكنك حفظ الملف ومشاركته من تطبيق الملفات."); }
  }
  useEffect(() => {
    document.documentElement.dataset.invoicePrint = format;
    return () => { delete document.documentElement.dataset.invoicePrint; };
  }, [format]);

  return (
    <div className="invoicePrintControls">
      <label>تنسيق الطباعة{" "}
        <select disabled={busy} value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="a4">صفحة A4</option>
          <option value="epson80">إيصال Epson — عرض 80 مم</option>
        </select>
      </label>
      <button type="button" onClick={() => window.print()}>طباعة الفاتورة</button>
      <button type="button" disabled={busy} onClick={downloadPdf}>{busy ? "تجهيز PDF…" : "تنزيل الفاتورة PDF"}</button>
      {notice && <small role="status">{notice}</small>}
      {pdfUrl && <>
        <a href={pdfUrl} download={pdfFile?.name}>حفظ ملف PDF بالجهاز</a>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">فتح ملف PDF</a>
        <button type="button" onClick={sharePdf}>مشاركة ملف PDF</button>
      </>}
      {format === "epson80" && <small>اختر طابعة Epson وورق 80 مم، والمقياس 100%، وأوقف رؤوس الصفحات وتذييلاتها.</small>}
    </div>
  );
}
