"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VarianceAction({ shiftId, ownRequest }: { shiftId: string; ownRequest: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: "APPROVE" | "REJECT") {
    const notes = window.prompt(decision === "APPROVE"
      ? "اكتب مبرر اعتماد فرق الوردية"
      : "اكتب سبب رفض فرق الوردية");
    if (!notes || notes.trim().length < 3) return;

    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/secure/shifts/${shiftId}/variance/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, notes }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "SELF_APPROVAL_NOT_ALLOWED"
        ? "لا يمكن لمقفل الوردية اعتماد فرقها بنفسه."
        : "تعذر اتخاذ القرار.");
      return;
    }
    router.refresh();
  }

  if (ownRequest) return <small className="muted">يتطلب اعتماد مستخدم مستقل</small>;

  return (
    <div className="actionStack">
      <button disabled={busy} onClick={() => decide("APPROVE")}>اعتماد الفرق</button>
      <button className="secondaryButton" disabled={busy} onClick={() => decide("REJECT")}>رفض</button>
      {message && <small className="moneyOut">{message}</small>}
    </div>
  );
}
