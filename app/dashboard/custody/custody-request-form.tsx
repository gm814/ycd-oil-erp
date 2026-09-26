"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Employee = { id: string; code: string; nameAr: string; phone: string | null };

export default function CustodyRequestForm({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");

    const response = await fetch("/api/secure/custody/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: data.get("employeeId") || undefined,
        custodianName: data.get("custodianName"),
        custodianPhone: data.get("custodianPhone"),
        purpose: data.get("purpose"),
        requestedAmount: data.get("requestedAmount"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "EMPLOYEE_NOT_FOUND" ? "الموظف المحدد غير متاح في هذا الفرع." : "تعذر إنشاء طلب العهدة.");
      return;
    }
    form.reset();
    setMessage("تم إنشاء طلب العهدة وإرساله للاعتماد.");
    router.refresh();
  }

  function fillEmployee(event: React.ChangeEvent<HTMLSelectElement>) {
    const employee = employees.find((item) => item.id === event.target.value);
    const form = event.currentTarget.form;
    if (!employee || !form) return;
    const name = form.elements.namedItem("custodianName") as HTMLInputElement | null;
    const phone = form.elements.namedItem("custodianPhone") as HTMLInputElement | null;
    if (name) name.value = employee.nameAr;
    if (phone) phone.value = employee.phone || "";
  }

  return (
    <form className="intakeForm" onSubmit={submit}>
      <label>ربط بموظف — اختياري
        <select name="employeeId" defaultValue="" onChange={fillEmployee}>
          <option value="">مستلم غير مرتبط بملف موظف</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} — {employee.nameAr}</option>)}
        </select>
      </label>
      <div className="formRow">
        <label>اسم مستلم العهدة<input name="custodianName" required /></label>
        <label>الجوال<input name="custodianPhone" /></label>
      </div>
      <label>الغرض من العهدة<input name="purpose" required /></label>
      <label>المبلغ المطلوب<input name="requestedAmount" type="number" min="0.01" step="0.01" required /></label>
      <button disabled={busy}>إرسال طلب العهدة</button>
      {message && <p className="formNotice">{message}</p>}
    </form>
  );
}
