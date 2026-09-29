"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CloseRow = {
  id: string;
  closeNo: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  salesTotal: number;
  netFinancialMovement: number;
  openShifts: number;
  unresolvedShiftVariances: number;
  unresolvedBankReconciliations: number;
  isOwn: boolean;
};

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة بانتظار المراجعة",
  REVIEWED: "تمت المراجعة",
  CLOSED: "مقفل نهائيًا",
};

export default function CloseActions({
  rows,
  canPrepare,
  canReview,
  defaultDay,
  defaultMonth,
}: {
  rows: CloseRow[];
  canPrepare: boolean;
  canReview: boolean;
  defaultDay: string;
  defaultMonth: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<"DAILY" | "MONTHLY">("DAILY");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown, success: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const messages: Record<string, string> = {
        PERIOD_NOT_FINISHED: "لا يمكن إعداد إقفال لفترة لم تنتهِ بعد.",
        SELF_REVIEW_NOT_ALLOWED: "لا يمكن لمعد الإقفال مراجعة أو إقفاله بنفسه.",
        OPEN_SHIFTS_REMAIN: "توجد ورديات مفتوحة داخل الفترة ويجب إقفالها أولًا.",
        SHIFT_VARIANCES_UNRESOLVED: "توجد فروقات ورديات لم تعتمد بعد.",
        BANK_RECONCILIATIONS_UNRESOLVED: "توجد مطابقات بنكية غير مقفلة أو بها فروقات.",
        DAILY_CLOSES_UNRESOLVED: "لا يمكن الإقفال الشهري قبل إقفال جميع الأيام التابعة للشهر.",
        FINANCIAL_CLOSE_REVIEW_REQUIRED: "يجب مراجعة الإقفال قبل الإقفال النهائي.",
        FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage(success);
    router.refresh();
    return true;
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void post("/api/secure/finance/closes", {
      type,
      period: data.get("period"),
      notes: data.get("notes"),
    }, "تم إعداد لقطة الإقفال وحساب المؤشرات والتنبيهات الرقابية.");
  }

  function decide(id: string, action: "REVIEW" | "CLOSE") {
    const notes = window.prompt(action === "REVIEW" ? "ملاحظات المراجعة (اختياري)" : "ملاحظات الإقفال النهائي (اختياري)") || undefined;
    void post(`/api/secure/finance/closes/${id}/review`, { action, notes }, action === "REVIEW"
      ? "تمت مراجعة الإقفال."
      : "تم الإقفال النهائي للفترة.");
  }

  return (
    <>
      {canPrepare && (
        <article className="panel">
          <h2>إعداد إقفال مالي</h2>
          <form className="intakeForm" onSubmit={prepare}>
            <div className="formRow">
              <label>نوع الإقفال
                <select value={type} onChange={(event) => setType(event.target.value as "DAILY" | "MONTHLY")}>
                  <option value="DAILY">إقفال يومي</option>
                  <option value="MONTHLY">إقفال شهري</option>
                </select>
              </label>
              <label>الفترة
                <input
                  key={type}
                  name="period"
                  type={type === "DAILY" ? "date" : "month"}
                  defaultValue={type === "DAILY" ? defaultDay : defaultMonth}
                  required
                />
              </label>
            </div>
            <label>ملاحظات الإعداد<input name="notes" placeholder="أي ملاحظات رقابية على الفترة" /></label>
            <button disabled={busy}>إعداد / تحديث المسودة</button>
          </form>
        </article>
      )}

      <article className="panel inventoryPanel">
        <h2>سجل الإقفالات</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>رقم الإقفال</th><th>النوع</th><th>الفترة</th><th>المبيعات</th><th>صافي الحركة</th>
                <th>وردية مفتوحة</th><th>فروقات ورديات</th><th>مطابقات معلقة</th><th>الحالة</th><th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><a className="orderLink" href={`/dashboard/finance/closes/${row.id}`}>{row.closeNo}</a></td>
                  <td>{row.type === "DAILY" ? "يومي" : "شهري"}</td>
                  <td>{new Date(row.periodStart).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })} — {new Date(row.periodEnd).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                  <td>{row.salesTotal.toFixed(2)} ر.س</td>
                  <td className={row.netFinancialMovement < 0 ? "moneyOut" : "moneyIn"}>{row.netFinancialMovement.toFixed(2)} ر.س</td>
                  <td>{row.openShifts}</td>
                  <td>{row.unresolvedShiftVariances}</td>
                  <td>{row.unresolvedBankReconciliations}</td>
                  <td>{statusLabel[row.status] ?? row.status}</td>
                  <td>
                    <div className="actionStack">
                      {canReview && row.status === "DRAFT" && !row.isOwn && (
                        <button disabled={busy} onClick={() => decide(row.id, "REVIEW")}>مراجعة</button>
                      )}
                      {canReview && row.status === "REVIEWED" && !row.isOwn && (
                        <button disabled={busy} onClick={() => decide(row.id, "CLOSE")}>إقفال نهائي</button>
                      )}
                      {row.isOwn && row.status !== "CLOSED" && <small className="muted">يتطلب مستخدمًا مستقلًا</small>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="empty">لا توجد إقفالات مالية مسجلة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
