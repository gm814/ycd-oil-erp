"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  code: string;
  areaAr: string;
  titleAr: string;
  status: string;
  executedAt: string | null;
  evidenceRef: string | null;
  notes: string | null;
};

const statusLabel: Record<string, string> = {
  NOT_RUN: "لم يُنفذ",
  PASSED: "ناجح",
  FAILED: "فاشل",
};

export default function UatChecklist({ rows, canExecute }: { rows: Row[]; canExecute: boolean }) {
  const router = useRouter();
  const [busyCode, setBusyCode] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, code: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyCode(code);
    setMessage("");
    const response = await fetch(`/api/secure/readiness/uat/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: data.get("status"),
        evidenceRef: data.get("evidenceRef"),
        notes: data.get("notes"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusyCode("");
    if (!response.ok) {
      const labels: Record<string, string> = {
        FORBIDDEN: "لا تملك صلاحية تنفيذ اختبارات UAT.",
        UAT_PREOPENING_ONLY: "لا يمكن تعديل UAT بعد بدء التشغيل التجاري.",
        UAT_CASE_NOT_FOUND: "سيناريو الاختبار غير معروف.",
        INVALID_INPUT: "راجع نتيجة الاختبار والملاحظات.",
      };
      setMessage(labels[result.error] || "تعذر حفظ نتيجة الاختبار.");
      return;
    }
    setMessage("تم حفظ نتيجة الاختبار وإضافتها إلى سجل التدقيق.");
    router.refresh();
  }

  return (
    <>
      <section className="uatGrid">
        {rows.map((row, index) => (
          <article className="panel uatCard" key={row.code}>
            <div className="uatCardHeader">
              <span className="teamCode">{String(index + 1).padStart(2, "0")}</span>
              <span className={row.status === "PASSED" ? "okBadge" : row.status === "FAILED" ? "alertBadge" : "statusBadge"}>
                {statusLabel[row.status] ?? row.status}
              </span>
            </div>
            <small>{row.areaAr}</small>
            <h2>{row.titleAr}</h2>
            {row.executedAt && <p className="muted">آخر تنفيذ: {new Date(row.executedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p>}
            {row.evidenceRef && <p><b>الدليل:</b> {row.evidenceRef}</p>}
            {row.notes && <p><b>ملاحظات:</b> {row.notes}</p>}

            {canExecute && (
              <form className="intakeForm" onSubmit={(event) => void submit(event, row.code)}>
                <label>النتيجة
                  <select name="status" defaultValue={row.status === "FAILED" ? "FAILED" : "PASSED"}>
                    <option value="PASSED">ناجح</option>
                    <option value="FAILED">فاشل</option>
                  </select>
                </label>
                <label>مرجع الدليل
                  <input name="evidenceRef" defaultValue={row.evidenceRef ?? ""} placeholder="رقم فاتورة / طلب / سند / ملاحظة اختبار" />
                </label>
                <label>ملاحظات
                  <textarea name="notes" defaultValue={row.notes ?? ""} rows={3} />
                </label>
                <button disabled={busyCode === row.code}>{busyCode === row.code ? "جارٍ الحفظ..." : "حفظ نتيجة الاختبار"}</button>
              </form>
            )}
          </article>
        ))}
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
