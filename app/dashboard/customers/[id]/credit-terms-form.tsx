"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function CreditTermsForm({
  customerId,
  creditAllowed,
  creditLimit,
  creditDays,
}: {
  customerId: string;
  creditAllowed: boolean;
  creditLimit: number;
  creditDays: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(creditAllowed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");

    const response = await fetch(`/api/secure/customers/${customerId}/credit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creditAllowed: enabled,
        creditLimit: Number(data.get("creditLimit") || 0),
        creditDays: Number(data.get("creditDays") || 0),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "INVALID_INPUT" ? "راجع حد الائتمان وأيام السداد." : "تعذر تحديث شروط الائتمان.");
      return;
    }
    setMessage("تم تحديث شروط الائتمان للعميل.");
    router.refresh();
  }

  return (
    <form className="intakeForm creditTermsForm" onSubmit={submit}>
      <label className="checkLabel">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        السماح بالبيع الآجل لهذا العميل
      </label>
      <div className="formRow">
        <label>حد الائتمان
          <input name="creditLimit" type="number" min="0" step="0.01" defaultValue={creditLimit} disabled={!enabled} required={enabled} />
        </label>
        <label>مهلة السداد بالأيام
          <input name="creditDays" type="number" min="0" max="365" defaultValue={creditDays} disabled={!enabled} required={enabled} />
        </label>
      </div>
      <button disabled={busy}>حفظ شروط الائتمان</button>
      {message && <p className="formNotice">{message}</p>}
    </form>
  );
}
