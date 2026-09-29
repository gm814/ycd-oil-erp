"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Employee = { id: string; code: string; nameAr: string };

export default function HrActions({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const now = new Date();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
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
        EMPLOYEE_CREATE_FAILED: "تعذر إنشاء الموظف؛ تحقق من عدم تكرار الكود.",
        PAYROLL_PERIOD_EXISTS: "مسير هذه الفترة موجود مسبقًا.",
        NO_ACTIVE_EMPLOYEES: "لا يوجد موظفون نشطون لإنشاء المسير.",
        NEGATIVE_NET_SALARY: "يوجد موظف تجاوزت خصوماته إجمالي استحقاقه.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم حفظ العملية بنجاح.");
    router.refresh();
    return true;
  }

  function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/hr/employees", Object.fromEntries(new FormData(form).entries()))
      .then((ok) => { if (ok) form.reset(); });
  }

  function attendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/hr/attendance", Object.fromEntries(new FormData(form).entries()))
      .then((ok) => { if (ok) form.reset(); });
  }

  function adjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/hr/adjustments", Object.fromEntries(new FormData(form).entries()))
      .then((ok) => { if (ok) form.reset(); });
  }

  function payroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/hr/payroll/generate", Object.fromEntries(new FormData(form).entries()));
  }

  return (
    <>
      <section className="workGrid">
        <article className="panel">
          <h2>إضافة موظف</h2>
          <form className="intakeForm" onSubmit={createEmployee}>
            <div className="formRow">
              <label>كود الموظف<input name="code" required /></label>
              <label>الاسم<input name="nameAr" required /></label>
            </div>
            <div className="formRow">
              <label>المسمى الوظيفي<input name="jobTitleAr" /></label>
              <label>الجوال<input name="phone" /></label>
            </div>
            <label>تاريخ المباشرة<input name="hireDate" type="date" /></label>
            <div className="formRow">
              <label>الراتب الأساسي<input name="baseSalary" type="number" min="0" step="0.01" required /></label>
              <label>بدل السكن<input name="housingAllowance" type="number" min="0" step="0.01" defaultValue="0" /></label>
            </div>
            <div className="formRow">
              <label>بدل النقل<input name="transportAllowance" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label>IBAN<input name="iban" /></label>
            </div>
            <button disabled={busy}>حفظ الموظف</button>
          </form>
        </article>

        <article className="panel">
          <h2>الحضور والانضباط</h2>
          <form className="intakeForm" onSubmit={attendance}>
            <label>الموظف<select name="employeeId" required defaultValue=""><option value="" disabled>اختر الموظف</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nameAr}</option>)}</select></label>
            <label>التاريخ<input name="workDate" type="date" required /></label>
            <label>الحالة<select name="status" defaultValue="PRESENT"><option value="PRESENT">حاضر</option><option value="ABSENT">غائب</option><option value="LEAVE">إجازة</option><option value="SICK">مرضي</option><option value="OFF">راحة</option></select></label>
            <div className="formRow">
              <label>دقائق التأخير<input name="lateMin" type="number" min="0" defaultValue="0" /></label>
              <label>دقائق العمل الإضافي<input name="overtimeMin" type="number" min="0" defaultValue="0" /></label>
            </div>
            <label>ملاحظات<input name="notes" /></label>
            <button disabled={busy || employees.length === 0}>تسجيل الحضور</button>
          </form>
        </article>
      </section>

      <section className="workGrid">
        <article className="panel">
          <h2>استحقاق أو خصم</h2>
          <form className="intakeForm" onSubmit={adjustment}>
            <label>الموظف<select name="employeeId" required defaultValue=""><option value="" disabled>اختر الموظف</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nameAr}</option>)}</select></label>
            <div className="formRow">
              <label>السنة<input name="year" type="number" defaultValue={now.getFullYear()} required /></label>
              <label>الشهر<input name="month" type="number" min="1" max="12" defaultValue={now.getMonth() + 1} required /></label>
            </div>
            <label>النوع<select name="type" defaultValue="EARNING"><option value="EARNING">استحقاق إضافي</option><option value="DEDUCTION">خصم</option></select></label>
            <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>السبب<input name="reason" required /></label>
            <label>المرجع<input name="reference" /></label>
            <button disabled={busy || employees.length === 0}>حفظ الاستحقاق / الخصم</button>
          </form>
        </article>

        <article className="panel">
          <h2>إنشاء مسير الرواتب</h2>
          <p>يُثبت المسير نسخة الراتب والبدلات والاستحقاقات والخصومات ومؤشرات الحضور وقت الإنشاء. الحضور لا ينشئ خصمًا ماليًا تلقائيًا؛ الخصومات المالية تسجل بشكل صريح قبل إنشاء المسير.</p>
          <form className="intakeForm" onSubmit={payroll}>
            <div className="formRow">
              <label>السنة<input name="year" type="number" defaultValue={now.getFullYear()} required /></label>
              <label>الشهر<input name="month" type="number" min="1" max="12" defaultValue={now.getMonth() + 1} required /></label>
            </div>
            <button disabled={busy || employees.length === 0}>إنشاء المسير للمراجعة</button>
          </form>
        </article>
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
