"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Role = { code: string; nameAr: string };
type Employee = {
  id: string;
  code: string;
  nameAr: string;
  jobTitleAr: string | null;
  suggestedRoleCodes: string[];
  user: null | {
    id: string;
    email: string;
    status: string;
    roleCodes: string[];
  };
};

export default function UserManagementActions({
  employees,
  roles,
  currentUserId,
}: {
  employees: Employee[];
  roles: Role[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        EMPLOYEE_NOT_FOUND: "الموظف غير موجود أو غير نشط.",
        EMPLOYEE_ALREADY_HAS_USER: "الموظف لديه حساب دخول بالفعل.",
        EMAIL_ALREADY_USED: "البريد الإلكتروني مستخدم في حساب آخر.",
        INVALID_ROLE: "أحد الأدوار المحددة غير صالح.",
        USER_NOT_FOUND: "حساب المستخدم غير موجود.",
        SELF_ACCESS_CHANGE_NOT_ALLOWED: "لا يمكن تغيير حالة أو أدوار حسابك الحالي من هذه الشاشة.",
        LAST_GENERAL_MANAGER_PROTECTED: "لا يمكن إيقاف أو إزالة صلاحية آخر مدير عام نشط.",
        FORBIDDEN: "لا تملك صلاحية إدارة المستخدمين.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage(success);
    router.refresh();
    return true;
  }

  function createUser(event: FormEvent<HTMLFormElement>, employeeId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roleCodes = data.getAll("roleCodes").map(String);
    void post("/api/secure/admin/users", {
      employeeId,
      email: data.get("email"),
      password: data.get("password"),
      roleCodes,
    }, "تم إنشاء حساب الدخول وربطه بالموظف.").then((ok) => { if (ok) form.reset(); });
  }

  function updateUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roleCodes = data.getAll("roleCodes").map(String);
    const password = String(data.get("password") || "");
    const isSelf = userId === currentUserId;
    void post(`/api/secure/admin/users/${userId}`, {
      ...(!isSelf ? { status: data.get("status"), roleCodes } : {}),
      ...(password ? { password } : {}),
    }, isSelf ? "تم تحديث كلمة مرور حسابك." : "تم تحديث حالة المستخدم وأدواره.").then((ok) => {
      if (ok) {
        const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
        if (passwordInput) passwordInput.value = "";
      }
    });
  }

  return (
    <>
      <section className="teamGrid userAdminGrid">
        {employees.map((employee) => (
          <article className="teamCard" key={employee.id}>
            <span className="teamCode">{employee.code}</span>
            <h2>{employee.nameAr}</h2>
            <b>{employee.jobTitleAr || "موظف"}</b>

            {!employee.user ? (
              <form className="intakeForm userAccessForm" onSubmit={(event) => createUser(event, employee.id)}>
                <label>البريد الإلكتروني
                  <input name="email" type="email" autoComplete="off" required placeholder="name@ycdoil.sa" />
                </label>
                <label>كلمة مرور مؤقتة
                  <input name="password" type="password" minLength={10} autoComplete="new-password" required />
                </label>
                <fieldset className="rolePicker">
                  <legend>الأدوار المقترحة حسب المسؤوليات المعتمدة</legend>
                  {roles.map((role) => (
                    <label key={role.code}>
                      <input type="checkbox" name="roleCodes" value={role.code} defaultChecked={employee.suggestedRoleCodes.includes(role.code)} />
                      <span>{role.nameAr}</span>
                    </label>
                  ))}
                </fieldset>
                <button disabled={busy}>إنشاء حساب دخول</button>
              </form>
            ) : (
              <form className="intakeForm userAccessForm" onSubmit={(event) => updateUser(event, employee.user!.id)}>
                <p className="userEmail">{employee.user.email}</p>
                <label>الحالة
                  <select name="status" defaultValue={employee.user.status} disabled={employee.user.id === currentUserId}>
                    <option value="ACTIVE">نشط</option>
                    <option value="SUSPENDED">موقوف</option>
                  </select>
                </label>
                <fieldset className="rolePicker" disabled={employee.user.id === currentUserId}>
                  <legend>الأدوار</legend>
                  {roles.map((role) => (
                    <label key={role.code}>
                      <input
                        type="checkbox"
                        name="roleCodes"
                        value={role.code}
                        defaultChecked={employee.user!.roleCodes.includes(role.code)}
                      />
                      <span>{role.nameAr}</span>
                    </label>
                  ))}
                </fieldset>
                <label>إعادة تعيين كلمة المرور
                  <input name="password" type="password" minLength={10} autoComplete="new-password" placeholder="اتركه فارغًا بدون تغيير" />
                </label>
                <button disabled={busy}>حفظ إعدادات المستخدم</button>
                {employee.user.id === currentUserId && <small className="muted">حسابك الحالي: تغيير الأدوار أو الإيقاف محمي، ويمكن فقط إعادة تعيين كلمة المرور.</small>}
              </form>
            )}
          </article>
        ))}
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
