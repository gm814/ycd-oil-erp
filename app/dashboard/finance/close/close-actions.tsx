"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CloseRow = {
  id: string;
  closeNo: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  salesTotal: number;
  netFinancialMovement: number;
  openShifts: number;
  unresolvedShiftVariances: number;
  unresolvedBankReconciliations: number;
  status: string;
  isOwn: boolean;
};

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة بانتظار المراجعة",
  REVIEWED: "تمت المراجعة",
  CLOSED: "مقفل نهائيًا",
};

function money(value: number) {
  return value.toFixed(2) + " ر.س";
}

export default function CloseActions({
  closes,
  canPrepare,
  canReview,
}: {
  closes: CloseRow[];
  canPrepare: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function post(url: string, body: unknown, success: string, key = "global") {
    setBusy(key);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      const messages: Record<string, string> = {
        PERIOD_NOT_FINISHED: "لا يمكن إعداد إقفال لفترة لم تنته بعد.",
        SELF_REVIEW_NOT_ALLOWED: "لا يمكن لمعد الإقفال مراجعته بنفسه.",
        OPEN_SHIFTS_REMAIN: "توجد ورديات مفتوحة داخل الفترة.",
        SHIFT_VARIANCES_UNRESOLVED: "توجد فروقات ورديات لم تعتمد بعد.",
        BANK_RECONCILIATIONS_UNRESOLVED: "توجد مطابقات بنكية غير مقفلة أو ناقصة.",
        FINANCIAL_CLOSE_REVIEW_REQUIRED: "يجب مراجعة الإقفال قبل الإقفال النهائي.",
        FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ عملية الإقفال المالي.");
      return false;
    }
    setMessage(success);
    router.refresh();
    return true;
  }

  function prepare(event: FormEvent<HTMLFormElement>, type: "DAILY" | "MONTHLY") {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void post("/api/secure/finance/closes", {
      type,
      period: data.get("period"),
      notes: data.get("notes"),
    }, "تم إعداد لقطة الإقفال المالي للفترة.", type).then((ok) => { if (ok) form.reset(); });
  }

  function act(id: string, action: "REVIEW" | "CLOSE") {
    void post(`/api/secure/finance/closes/${id}/review`, { action }, action === "REVIEW"
      ? "تمت مراجعة الإقفال المالي."
      : "تم الإقفال المالي النهائي للفترة.", id);
  }

  return (
    <>
      {canPrepare && (
        <section className="workGrid">
          <article className="panel">
            <h2>إعداد إقفال يومي</h2>
            <p className="muted">يلخص المبيعات والتحصيلات والمصروفات وفروقات الورديات لذلك اليوم.</p>
            <form className="intakeForm" onSubmit={(event) => prepare(event, "DAILY")}>
              <label>اليوم<input name="period" type="date" required /></label>
              <label>ملاحظات<input name="notes" placeholder="ملاحظات الإقفال اليومي" /></label>
              <button disabled={busy === "DAILY"}>إعداد / تحديث الإقفال اليومي</button>
            </form>
          </article>

          <article className="panel">
            <h2>إعداد إقفال شهري</h2>
            <p className="muted">لا يقفل نهائيًا قبل معالجة فروقات الورديات والمطابقات البنكية المطلوبة.</p>
            <form className="intakeForm" onSubmit={(event) => prepare(event, "MONTHLY")}>
              <label>الشهر<input name="period" type="month" required /></label>
              <label>ملاحظات<input name="notes" placeholder="ملاحظات الإقفال الشهري" /></label>
              <button disabled={busy === "MONTHLY"}>إعداد / تحديث الإقفال الشهري</button>
            </form>
          </article>
        </section>
      )}

      <article className="panel inventoryPanel">
        <h2>سجل الإقفالات المالية</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>رقم الإقفال</th><th>الفترة</th><th>المبيعات</th><th>صافي الحركة</th>
                <th>وردية مفتوحة</th><th>فروقات غير معالجة</th><th>مطابقات بنكية</th><th>الحالة</th><th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((item) => (
                <tr key={item.id}>
                  <td><b>{item.closeNo}</b></td>
                  <td>{item.type === "DAILY" ? "يومي" : "شهري"} · {new Date(item.periodStart).toLocaleDateString("ar-SA-u-nu-latn")} — {new Date(item.periodEnd).toLocaleDateString("ar-SA-u-nu-latn")}</td>
                  <td>{money(item.salesTotal)}</td>
                  <td className={item.netFinancialMovement < 0 ? "moneyOut" : "moneyIn"}>{money(item.netFinancialMovement)}</td>
                  <td>{item.openShifts}</td>
                  <td>{item.unresolvedShiftVariances}</td>
                  <td>{item.unresolvedBankReconciliations}</td>
                  <td>{statusLabel[item.status] ?? item.status}</td>
                  <td>
                    {canReview && item.status === "DRAFT" && !item.isOwn && (
                      <button disabled={busy === item.id} onClick={() => act(item.id, "REVIEW")}>مراجعة</button>
                    )}
                    {canReview && item.status === "REVIEWED" && !item.isOwn && (
                      <button disabled={busy === item.id} onClick={() => act(item.id, "CLOSE")}>إقفال نهائي</button>
                    )}
                    {item.isOwn && item.status !== "CLOSED" && <span className="muted">يلزم مراجع مستقل</span>}
                    {item.status === "CLOSED" && <span className="okBadge">مقفل</span>}
                  </td>
                </tr>
              ))}
              {closes.length === 0 && <tr><td colSpan={9} className="empty">لا توجد إقفالات مالية بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
