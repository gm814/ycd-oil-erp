"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type OpenShift = {
  id: string;
  openedAt: string;
  openingCash: number;
  expectedCash: number;
  expectedCard: number;
  expectedTransfer: number;
};

function money(value: number) {
  return value.toFixed(2) + " ر.س";
}

export default function ShiftControls({
  openShift,
  canOpen,
  canClose,
}: {
  openShift: OpenShift | null;
  canOpen: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>, url: string) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(
        result.error === "SHIFT_ALREADY_OPEN"
          ? "توجد وردية مفتوحة بالفعل."
          : result.error === "NO_OPEN_SHIFT"
            ? "لا توجد وردية مفتوحة."
            : result.error === "FORBIDDEN"
              ? "لا تملك صلاحية تنفيذ هذه العملية."
              : "تعذر تنفيذ العملية.",
      );
      return;
    }
    setMessage(url.endsWith("/open") ? "تم فتح الوردية." : "تمت مطابقة قنوات التحصيل وإقفال الوردية.");
    form.reset();
    router.refresh();
  }

  return (
    <section className="workGrid">
      <article className="panel">
        <h2>{openShift ? "الوردية الحالية" : "فتح وردية"}</h2>
        {openShift ? (
          <>
            <div className="shiftSummary">
              <b>بدأت: {new Date(openShift.openedAt).toLocaleString("ar-SA")}</b>
              <span>رصيد البداية: {money(openShift.openingCash)}</span>
            </div>
            <div className="agingGrid">
              <div><span>النقد المتوقع</span><b>{money(openShift.expectedCash)}</b></div>
              <div><span>مدى / البطاقات المتوقع</span><b>{money(openShift.expectedCard)}</b></div>
              <div><span>التحويلات المتوقعة</span><b>{money(openShift.expectedTransfer)}</b></div>
            </div>
          </>
        ) : canOpen ? (
          <form className="intakeForm" onSubmit={(event) => void submit(event, "/api/secure/shifts/open")}>
            <label>النقدية الافتتاحية<input name="openingCash" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <button disabled={busy}>فتح الوردية</button>
          </form>
        ) : (
          <p className="empty">لا تملك صلاحية فتح وردية.</p>
        )}
      </article>

      <article className="panel">
        <h2>إقفال وتسوية الوردية</h2>
        {canClose ? (
          <form className="intakeForm" onSubmit={(event) => void submit(event, "/api/secure/shifts/close")}>
            <label>
              النقدية المعدودة فعليًا
              <input name="countedCash" type="number" min="0" step="0.01" required disabled={!openShift} />
            </label>
            <label>
              إجمالي جهاز مدى / البطاقات
              <input name="countedCard" type="number" step="0.01" required disabled={!openShift} />
            </label>
            <label>
              التحويلات البنكية المؤكدة
              <input name="countedTransfer" type="number" step="0.01" required disabled={!openShift} />
            </label>
            <label>ملاحظات التسوية<input name="notes" disabled={!openShift} /></label>
            <button disabled={busy || !openShift}>مطابقة القنوات وإقفال</button>
          </form>
        ) : (
          <p className="empty">لا تملك صلاحية إقفال الوردية.</p>
        )}
      </article>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </section>
  );
}
