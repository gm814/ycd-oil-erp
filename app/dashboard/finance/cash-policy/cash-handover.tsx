"use client";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export default function CashHandover({ drawerId, treasuryId, drawerBalance, treasuryBalance, hasOpenShift }: { drawerId: string; treasuryId: string; drawerBalance: number; treasuryBalance: number; hasOpenShift: boolean }) {
  const router = useRouter();
  const [direction, setDirection] = useState("handover");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [voucherId, setVoucherId] = useState("");
  const pending = useRef<{ key: string; payload: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = JSON.stringify({ amount: values.amount, reference: values.reference, sourceAccountId: direction === "handover" ? drawerId : treasuryId, destinationAccountId: direction === "handover" ? treasuryId : drawerId, notes: direction === "handover" ? "تسليم نقد الدرج للإدارة بعد الاستلام الفعلي" : "تمويل عهدة درج الكاشير" });
    if (!pending.current || pending.current.payload !== payload) pending.current = { key: crypto.randomUUID(), payload };
    setBusy(true); setMessage(""); setVoucherId("");
    try {
      const response = await fetch("/api/secure/finance/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...JSON.parse(payload), idempotencyReference: pending.current.key }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error === "INSUFFICIENT_FINANCIAL_BALANCE" ? "الرصيد غير كافٍ. لا يمكن تسجيل تسليم أو تمويل دون رصيد فعلي." : result.error === "OPEN_SHIFT_REQUIRED" ? "تسليم نقد الدرج يتم أثناء الوردية المفتوحة، ثم تُقفل بعد عد المتبقي." : "تعذر التسجيل. راجع الصلاحيات والحسابات ثم أعد المحاولة."); return; }
      setVoucherId(result.out.id); setMessage("تم تسجيل التحويل بسند، وتحديث رصيد الحسابين."); pending.current = null; form.reset(); router.refresh();
    } catch { setMessage("تعذر تأكيد النتيجة. أعد المحاولة بنفس البيانات للتحقق دون تكرار السند."); }
    finally { setBusy(false); }
  }
  return <article className="panel"><h2>تسليم نقد الدرج أو تمويل عهدته</h2><p>يسجل المحاسب العملية بعد انتقال النقد فعليًا. سلّم النقد قبل إقفال الوردية، ثم أدخل في الإقفال ما بقي في الدرج فعلًا.</p><form className="intakeForm" onSubmit={submit}>
    <label>العملية<select value={direction} onChange={e => setDirection(e.target.value)} disabled={busy}><option value="handover">تسليم من درج الكاشير إلى الإدارة</option><option value="float">تمويل عهدة الدرج من الإدارة</option></select></label>
    <p>المتاح: {(direction === "handover" ? drawerBalance : treasuryBalance).toFixed(2)} ر.س</p>
    <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required disabled={busy} /></label>
    <label>مرجع التسليم<input name="reference" maxLength={120} required disabled={busy} /></label>
    <label><input type="checkbox" required disabled={busy} />أؤكد أن النقد سُلّم واستُلم فعليًا.</label>
    <button disabled={busy || (direction === "handover" && !hasOpenShift)}>تسجيل التحويل وإصدار السند</button>
  </form>{message && <p className="formNotice" role="status">{message}</p>}{voucherId && <a className="secondaryButton" href={`/dashboard/finance/transactions/${voucherId}/voucher`}>عرض / طباعة سند التحويل</a>}</article>;
}
