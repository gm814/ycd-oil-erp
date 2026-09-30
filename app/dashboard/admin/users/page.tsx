import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { operationalTeam } from "@/lib/operations";
import UserManagementActions from "./user-management-actions";

const suggestedRolesByEmployeeCode = new Map<string, string[]>();
for (const member of operationalTeam) {
  suggestedRolesByEmployeeCode.set(member.code, [...member.systemRoleCodes]);
}

export default async function UserManagementPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const [employees, roles] = await Promise.all([
    db.employee.findMany({
      where: { branchId: session.branchId, active: true },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    db.role.findMany({ orderBy: { nameAr: "asc" } }),
  ]);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/admin" className="backLink">← مدير النظام</a>
          <h1>المستخدمون والصلاحيات</h1>
          <p>إنشاء الحسابات وتعديل اسم المستخدم والبريد وكلمة المرور وإدارة الحالة والأدوار، مع حماية صلاحيات حسابك الحالي.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>الموظفون النشطون</span><b>{employees.length.toLocaleString("ar-SA")}</b></article>
        <article><span>حسابات مفعلة</span><b>{employees.filter((employee) => employee.user?.status === "ACTIVE").length.toLocaleString("ar-SA")}</b></article>
        <article><span>بدون حساب دخول</span><b>{employees.filter((employee) => !employee.user).length.toLocaleString("ar-SA")}</b></article>
        <article><span>حسابات موقوفة</span><b>{employees.filter((employee) => employee.user?.status === "SUSPENDED").length.toLocaleString("ar-SA")}</b></article>
      </section>

      <UserManagementActions
        currentUserId={session.userId}
        roles={roles.map((role) => ({ code: role.code, nameAr: role.nameAr }))}
        employees={employees.map((employee) => ({
          id: employee.id,
          code: employee.code,
          nameAr: employee.nameAr,
          jobTitleAr: employee.jobTitleAr,
          suggestedRoleCodes: suggestedRolesByEmployeeCode.get(employee.code) ?? [],
          user: employee.user ? {
            id: employee.user.id,
            username: employee.user.username,
            email: employee.user.email,
            mustChangePassword: employee.user.mustChangePassword,
            status: employee.user.status,
            roleCodes: employee.user.roles.map((entry) => entry.role.code),
          } : null,
        }))}
      />
    </main>
  );
}
