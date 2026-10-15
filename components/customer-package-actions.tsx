"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isCustomerPhone, normalizeCustomerPhone } from "@/lib/customer-phone";
type Package = { token: string; url: string; phone: string | null; customerName: string; invoiceNo: string; couponState: string };
const statusText: Record<string, string> = {
  ACTIVE: "الحزمة تضم الفاتورة وبطاقة التذكير وكوبون الغسيل الصالح.",
  FILTER_REQUIRED: "الحزمة تضم الفاتورة وبطاقة التذكير. لا يوجد فلتر زيت؛ إصدار كوبون الغسيل يحتاج تجاوزًا معتمدًا لشرط الفلتر.",
  OIL_REQUIRED: "الحزمة تضم الفاتورة وبطاقة التذكير. لا يوجد تغيير زيت، لذلك لا يمكن منح غسلة مجانية أو تجاوز هذا الشرط.",
  UNAVAILABLE: "الكوبون السابق مستخدم أو ملغى أو منتهي؛ لا يُصدر بديل تلقائيًا ولا يُرفق كوبون صالح جديد.",
  RETURN_REVIEW: "توجد مرتجعات؛ لا يُصدر كوبون جديد قبل مراجعتها. الفاتورة وبطاقة التذكير متاحتان.",
};
export default function CustomerPackageActions({ invoiceId, canOverride, hasOil, hasOilFilter }: { invoiceId: string; canOverride: boolean; hasOil: boolean; hasOilFilter: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<Package | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [waive, setWaive] = useState(false), [reason, setReason] = useState(""), [format, setFormat] = useState("epson80");
  async function prepare() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/secure/invoices/${invoiceId}/package`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waiveFilter: waive, reason }) });
      const data = await response.json();
      if (!response.ok) {
        const errors: Record<string, string> = { FORBIDDEN: "يلزم صلاحية إصدار الفواتير.", OVERRIDE_FORBIDDEN: "يلزم صلاحية اعتماد الخدمة وسبب تجاوز من 5 أحرف على الأقل.", OIL_REQUIRED: "تغيير الزيت شرط أساسي لا يمكن تجاوزه.", CONCURRENT_CHANGE: "حدث تغيير متزامن؛ اضغط تجهيز مرة أخرى.", RETURN_REVIEW_REQUIRED: "توجد مرتجعات تحتاج مراجعة.", INVOICE_NOT_ELIGIBLE: "الحزمة متاحة للخدمة المكتملة والفاتورة غير الملغاة فقط." };
        throw new Error(errors[data.error] || "تعذر تجهيز المستندات. حاول مجددًا.");
      }
      setResult(data); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تجهيز المستندات."); }
    finally { setBusy(false); }
  }
  const phone = result?.phone && isCustomerPhone(result.phone) ? normalizeCustomerPhone(result.phone) : "";
  const number = /^05\d{8}$/.test(phone) ? `966${phone.slice(1)}` : null;
  const pdf = result ? `/api/invoices/${invoiceId}/pdf?bundle=1&token=${encodeURIComponent(result.token)}&format=${format}` : "";
  const message = result ? `مرحبًا ${result.customerName}، مستندات خدمتك من YCD OIL — ${result.invoiceNo}.\n${result.couponState === "ACTIVE" ? "الفاتورة وبطاقة التذكير وكوبون الغسيل المجاني" : "الفاتورة وبطاقة التذكير"} في رابط واحد للتنزيل والطباعة:\n${result.url}\nالرابط صالح لمدة 7 أيام.` : "";
  return <section className="panel noPrint" id="customer-package" style={{ margin: "20px 0" }}>
    <h2>مستندات العميل — مشاركة واحدة</h2>
    <p>الفاتورة، بطاقة التذكير، وكوبون الغسيل المستحق في ملف PDF واحد.</p>
    <p>استحقاق الغسيل: تغيير الزيت مع فلتر الزيت. التجاوز المعتمد يخص الفلتر فقط.</p>
    {canOverride && hasOil && !hasOilFilter && <div>
      <label className="checkLabel"><input type="checkbox" checked={waive} onChange={e => { setWaive(e.target.checked); setResult(null); }} /> منح الغسيل استثنائيًا مع تغيير الزيت دون فلتر</label>
      {waive && <label>سبب التجاوز<input value={reason} onChange={e => { setReason(e.target.value); setResult(null); }} minLength={5} maxLength={300} required placeholder="يسجل السبب واسم المعتمد في سجل التدقيق" /></label>}
    </div>}
    <button type="button" disabled={busy || (waive && reason.trim().length < 5)} onClick={prepare}>{busy ? "جارٍ تجهيز المستندات…" : "تجهيز مستندات العميل"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div>
      <p role="status">{statusText[result.couponState]}</p>
      <p>جوال العميل: <b dir="ltr">{result.phone || "غير مسجل"}</b></p>
      <label>مقاس الطباعة<select value={format} onChange={e => setFormat(e.target.value)}><option value="epson80">EPSON — عرض 80 مم</option><option value="a4">A4</option></select></label>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0" }}>
        <a className="secondaryLink" href={pdf}>تنزيل المستندات معًا</a>
        <a className="secondaryLink" href={`${pdf}&inline=1`} target="_blank" rel="noreferrer">عرض وطباعة المستندات معًا</a>
        {number && <a className="secondaryLink" href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">مشاركة الحزمة مع واتساب العميل</a>}
      </div>
      {!number && <p role="alert">حدّث جوال العميل إلى رقم سعودي صحيح من 10 أرقام يبدأ بـ 05 لتفعيل واتساب.</p>}
      <p>واتساب يفتح محادثة العميل برسالة ورابط واحد للمستندات؛ راجعها واضغط إرسال. الرابط خاص بالعميل وصالح 7 أيام. للطباعة افتح الملف واختر رمز الطابعة.</p>
    </div>}
  </section>;
}
