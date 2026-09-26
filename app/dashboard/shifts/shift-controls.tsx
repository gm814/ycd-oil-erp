"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type OpenShift = { id: string; openedAt: string; openingCash: number };

export default function ShiftControls({ openShift }: { openShift: OpenShift | null }) {
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
      setMessage(result.error === "SHIFT_ALREADY_OPEN" ? "توجد وردية مفتوحة بالفعل." : result.error === "NO_OPEN_SHIFT" ? "لا توجد وردية مفتوحة." : "تعذر تنفيذ العملية.");
      return;
    }
    setMessage(url.endsWith("/open") ? "تم فتح الوردية." : "تم إقفال الوردية ومطابقة النقدية.");
    form.reset();
    router.refresh();
  }

  return (
    <section className="workGrid">
      <article className="panel">
        <h2>{openShift ? "الوردية الحالية" : "فتح وردية"}</h2>
        {openShift ? (
          <div className="shiftSummary">
            <b>بدأت: {new Date(openShift.openedAt).toLocaleString("ar-SA")}</b>
            <span>رصيد البداية: {openShift.openingCash.toFixed(2)} ر.س</span>
          </div>
        ) : (
          <form className="intakeForm" onSubmit={(event) => void submit(event, "/api/secure/shifts/open")}>
            <label>النقدية الافتتاحية<input name="openingCash" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <button disabled={busy}>فتح الوردية</button>
          </form>
        )}
      </article>

      <article className="panel">
        <h2>إقفال الوردية</h2>
        <form className="intakeForm" onSubmit={(event) => void submit(event, "/api/secure/shifts/close")}>
          <label>النقدية المعدودة فعليًا<input name="countedCash" type="number" min="0" step="0.01" required disabled={!openShift} /></label>
          <label>ملاحظات<input name="notes" disabled={!openShift} /></label>
          <button disabled={busy || !openShift}>مطابقة وإقفال</button>
        </form>
      </article>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </section>
  );
}
