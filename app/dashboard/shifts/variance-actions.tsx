"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Variance = {
  id: string;
  shiftId: string;
  closedAt: string | null;
  cashVariance: number;
  cardVariance: number;
  transferVariance: number;
  reason: string | null;
  isOwn: boolean;
};

function money(value: number) {
  return value.toFixed(2) + " ر.س";
}

export default function VarianceActions({ items }: { items: Variance[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function decide(event: FormEvent<HTMLFormElement>, id: string, decision: "APPROVE" | "REJECT") {
    event.preventDefault();
    const form = event.currentTarget;
    const notes = String(new FormData(form).get("notes") || "").trim();
    if (notes.length < 3) {
      setMessage("سجل مبررًا واضحًا قبل اتخاذ القرار.");
      return;
    }

    setBusy(id);
    setMessage("");
    const response = await fetch(`/api/secure/shifts/variances/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, notes }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      const messages: Record<string, string> = {
        SELF_APPROVAL_NOT_ALLOWED: "لا يمكن لمقفل الوردية اعتماد فرقها بنفسه.",
        SHIFT_VARIANCE_ALREADY_DECIDED: "تم اتخاذ قرار على هذا الفرق مسبقًا.",
        FORBIDDEN: "لا تملك صلاحية اعتماد فروقات الورديات.",
      };
      setMessage(messages[result.error] || "تعذر تسجيل قرار فرق الوردية.");
      return;
    }
    setMessage(decision === "APPROVE" ? "تم اعتماد فرق الوردية مع توثيق المبرر." : "تم رفض فرق الوردية وإبقاؤه كعائق أمام الإقفال المالي.");
    router.refresh();
  }

  if (items.length === 0) return null;

  return (
    <article className="panel inventoryPanel">
      <h2>فروقات ورديات تنتظر الاعتماد</h2>
      <p className="muted">أي فرق غير معتمد يمنع الإقفال المالي للفترة المرتبطة به.</p>
      {items.map((item) => (
        <form key={item.id} className="intakeForm paymentCard" data-variance={item.id} onSubmit={(event) => void decide(event, item.id, "APPROVE")}>
          <div>
            <b>وردية {item.shiftId.slice(0, 8).toUpperCase()} · {item.closedAt ? new Date(item.closedAt).toLocaleString("ar-SA") : "—"}</b>
            <span>النقد: {money(item.cashVariance)} · مدى: {money(item.cardVariance)} · التحويل: {money(item.transferVariance)}</span>
            <span>المبرر عند الإقفال: {item.reason || "لم يسجل مبرر."}</span>
          </div>
          {item.isOwn ? (
            <p className="muted">بانتظار مستخدم مخول آخر لاعتماد الفرق.</p>
          ) : (
            <>
              <label>قرار المراجع / المبرر
                <input name="notes" required minLength={3} placeholder="سبب قبول الفرق أو رفضه والإجراء المتخذ" />
              </label>
              <div className="formRow">
                <button disabled={busy === item.id} type="submit">اعتماد الفرق</button>
                <button
                  className="secondaryButton"
                  disabled={busy === item.id}
                  type="button"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>(`form[data-variance="${item.id}"]`);
                    if (form) void decide({ preventDefault() {}, currentTarget: form } as FormEvent<HTMLFormElement>, item.id, "REJECT");
                  }}
                >رفض الفرق</button>
              </div>
            </>
          )}
        </form>
      ))}
      {message && <p className="formNotice globalNotice">{message}</p>}
    </article>
  );
}
