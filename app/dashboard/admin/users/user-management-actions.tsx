"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";

type Role = { code: string; nameAr: string };
type Employee = {
  id: string;
  code: string;
  nameAr: string;
  jobTitleAr: string | null;
  suggestedRoleCodes: string[];
  user: null | {
    id: string;
    username: string;
    email: string | null;
    mustChangePassword: boolean;
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
  const [provisioned, setProvisioned] = useState<Array<{
    employeeCode: string;
    employeeName: string;
    username: string;
    temporaryPassword: string;
    roles: string[];
  }>>([]);

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
        USERNAME_ALREADY_USED: "اسم المستخدم مستخدم في حساب آخر.",
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

  async function provisionTeam() {
    if (!window.confirm("سيتم إنشاء حسابات دخول للموظفين الذين لا يملكون حسابًا، بكلمات مرور مؤقتة تظهر مرة واحدة فقط. هل تريد المتابعة؟")) return;
    setBusy(true);
    setMessage("");
    setProvisioned([]);
    const response = await fetch("/api/secure/admin/users/provision-team", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const code = String(result.error || "");
      setMessage(
        code.startsWith("EMPLOYEE_MISSING") ? "بيانات أحد موظفي الفريق التشغيلي غير مكتملة."
          : code.startsWith("USERNAME_ALREADY_USED") ? "أحد أسماء المستخدمين المقترحة مستخدم مسبقًا."
            : code.startsWith("OPERATIONAL_ROLE_MISSING") ? "أحد الأدوار التشغيلية غير موجود في النظام."
              : code === "FORBIDDEN" ? "لا تملك صلاحية تهيئة حسابات الفريق."
                : "تعذر تهيئة حسابات الفريق."
      );
      return;
    }
    const credentials = Array.isArray(result.credentials) ? result.credentials : [];
    setProvisioned(credentials);
    setMessage(credentials.length > 0
      ? `تم إنشاء ${credentials.length} حسابات. احفظ كلمات المرور المؤقتة الآن؛ لن تظهر مرة أخرى بعد تحديث الصفحة.`
      : "جميع موظفي الفريق التشغيلي لديهم حسابات دخول بالفعل.");
    router.refresh();
  }

  function createUser(event: FormEvent<HTMLFormElement>, employeeId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roleCodes = data.getAll("roleCodes").map(String);
    void post("/api/secure/admin/users", {
      employeeId,
      username: data.get("username"),
      email: data.get("email"),
      password: data.get("password"),
      roleCodes,
    }, "تم إنشاء حساب الدخول وربطه بالموظف. كلمة المرور مؤقتة ويجب تغييرها عند أول دخول.")
      .then((ok) => { if (ok) form.reset(); });
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
    }, isSelf ? "تم تحديث كلمة مرور حسابك." : "تم تحديث حالة المستخدم وأدواره.")
      .then((ok) => {
        if (ok) {
          const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
          if (passwordInput) passwordInput.value = "";
        }
      });
  }

  return (
    <>
      <article className="panel accessProvisionPanel">
        <div>
          <h2>تهيئة حسابات الفريق التشغيلي</h2>
          <p className="muted">ينشئ النظام الحسابات الناقصة فقط حسب الهيكل المعتمد، ويولد كلمة مرور قوية ومؤقتة لكل موظف مع إلزامه بتغييرها عند أول دخول.</p>
        </div>
        <button type="button" disabled={busy || employees.every((employee) => employee.user)} onClick={provisionTeam}>
          تهيئة الحسابات الناقصة
        </button>
      </article>

      {provisioned.length > 0 && (
        <article className="panel temporaryCredentials">
          <h2>بيانات الدخول المؤقتة — تظهر مرة واحدة</h2>
          <p className="alertBadge">احفظ هذه البيانات في مكان آمن ثم وزع كل حساب على صاحبه فقط. لا تُسجل كلمات المرور في سجل التدقيق.</p>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الموظف</th><th>اسم المستخدم</th><th>كلمة المرور المؤقتة</th><th>الأدوار</th></tr></thead>
              <tbody>
                {provisioned.map((item) => (
                  <tr key={item.employeeCode}>
                    <td><b>{item.employeeName}</b><br /><small>{item.employeeCode}</small></td>
                    <td dir="ltr"><b>{item.username}</b></td>
                    <td dir="ltr"><code>{item.temporaryPassword}</code></td>
                    <td>{item.roles.join(" + ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <section className="teamGrid userAdminGrid">
        {employees.map((employee) => (
          <article className="teamCard" key={employee.id}>
            <span className="teamCode">{employee.code}</span>
            <h2>{employee.nameAr}</h2>
            <b>{employee.jobTitleAr || "موظف"}</b>

            {!employee.user ? (
              <form className="intakeForm userAccessForm" onSubmit={(event) => createUser(event, employee.id)}>
                <label>اسم المستخدم
                  <input
                    name="username"
                    type="text"
                    autoComplete="off"
                    required
                    defaultValue={employee.code.toLowerCase()}
                    pattern="[A-Za-z0-9._-]+"
                  />
                </label>
                <label>البريد الإلكتروني — اختياري
                  <input name="email" type="email" autoComplete="off" placeholder="name@ycdoil.sa" />
                </label>
                <label>كلمة مرور مؤقتة
                  <PasswordInput name="password" minLength={10} autoComplete="new-password" required />
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
                <p className="userEmail">
                  <b>{employee.user.username}</b>
                  {employee.user.email ? ` · ${employee.user.email}` : ""}
                </p>
                {employee.user.mustChangePassword && (
                  <p className="alertBadge">كلمة مرور مؤقتة — يجب تغييرها عند أول دخول</p>
                )}
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
                  <PasswordInput name="password" minLength={10} autoComplete="new-password" placeholder="اتركه فارغًا بدون تغيير" />
                </label>
                {employee.user.id !== currentUserId && (
                  <small className="muted">عند إعادة التعيين تصبح كلمة المرور مؤقتة ويُلزم الموظف بتغييرها عند أول دخول.</small>
                )}
                <button disabled={busy}>حفظ إعدادات المستخدم</button>
                {employee.user.id === currentUserId && (
                  <small className="muted">حسابك الحالي: تغيير الأدوار أو الإيقاف محمي، ويمكن فقط إعادة تعيين كلمة المرور.</small>
                )}
              </form>
            )}
          </article>
        ))}
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
