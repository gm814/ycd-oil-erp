"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function IntakeForm({ channel = "OIL" }: { channel?: "OIL" | "WASH" }) {
  type Match = { id: string; customerId: string; customerNo: string; customerName: string; phone: string | null; plate: string; make: string | null; model: string | null; year: number | null; odometer: number | null; nextServiceKm: number | null; nextServiceAt: string | null };
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [searching, setSearching] = useState(false);
  async function lookup() {
    if (query.trim().length < 2) { setMessage("أدخل لوحة السيارة أو رقم العميل أو رمز الولاء أو الجوال."); return; }
    setSearching(true); setMessage("");
    try { const r = await fetch(`/api/secure/service-orders/lookup?q=${encodeURIComponent(query)}`); const result = await r.json(); if (!r.ok) throw new Error(); setMatches(result.vehicles); if (!result.vehicles.length) setMessage("لا توجد سيارة مطابقة في سجلات الفرع."); }
    catch { setMessage("تعذر البحث. تحقق من الاتصال."); } finally { setSearching(false); }
  }
  function choose(v: Match) {
    setSelected(v); setMatches([]);
    for (const [name, value] of Object.entries({ customerName: v.customerName, phone: v.phone, plate: v.plate, make: v.make, model: v.model, year: v.year, odometer: v.odometer })) {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
      if (field) field.value = value === null ? "" : String(value);
    }
  }
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setMessage("");
    setLoading(true);
    try {

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries([...form.entries()].filter(([key, value]) => !(["year", "odometer"].includes(key) && value === "")));

    const response = await fetch("/api/secure/service-orders", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, channel, ...(selected ? { customerId: selected.customerId, vehicleId: selected.id } : {}) }),
    });

    const result = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage(result.error === "OPEN_SHIFT_REQUIRED"
        ? "يجب فتح وردية تشغيلية قبل استقبال السيارات."
        : result.error === "CUSTOMER_SELECTION_MISMATCH" ? "بيانات العميل لا تطابق السيارة المسجلة. ابحث عن السيارة واختر ملفها الصحيح." : result.error === "ODOMETER_DECREASE" ? "قراءة العداد أقل من القراءة السابقة؛ راجعها." : "تعذر فتح أمر الخدمة. راجع البيانات والصلاحيات.");
      return;
    }

    setMessage(`تم فتح أمر الخدمة: ${result.order.orderNo}`);
    formElement.reset(); setSelected(null);
    router.push(`/dashboard/service-orders/${result.order.id}`);
    router.refresh();
    } catch { setMessage("لم نتأكد من نتيجة الحفظ بسبب الاتصال. احتفظ بالبيانات وتحقق من قائمة الأوامر قبل إعادة الإرسال."); }
    finally { setLoading(false); }
  }

  return (
    <><section className="panel"><h3>عميل أو سيارة سبق خدمتها</h3><label>ابحث باللوحة أو رقم العميل أو رمز الولاء أو الجوال<input value={query} onChange={e=>setQuery(e.target.value)} /></label><button type="button" onClick={lookup} disabled={searching}>{searching ? "جارٍ البحث..." : "بحث"}</button>{matches.map(v=><p key={v.id}><button type="button" onClick={()=>choose(v)}>{v.plate} — {v.customerName} — {v.customerNo}</button></p>)}{selected && <p>العميل {selected.customerNo} · الموعد السابق: {selected.nextServiceAt ? new Date(selected.nextServiceAt).toLocaleDateString("ar-SA") : "—"} · عند {selected.nextServiceKm ?? "—"} كم <button type="button" onClick={()=>{setSelected(null);formRef.current?.reset();}}>إلغاء الاختيار</button></p>}</section>
    <form ref={formRef} className="intakeForm" onSubmit={submit}>
      <label>اسم العميل<input name="customerName" required readOnly={Boolean(selected)} /></label>
      <label>رقم الجوال<input name="phone" inputMode="tel" readOnly={Boolean(selected)} /></label>
      <label>رقم اللوحة<input name="plate" required readOnly={Boolean(selected)} /></label>
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
    </form></>
  );
}
