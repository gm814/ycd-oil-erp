import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import UserManagementActions from "./user-management-actions";

const suggestedRolesByEmployeeCode: Record<string, string[]> = {
  "YCD-001": ["GENERAL_MANAGER"],
  "YCD-002": ["BRANCH_MANAGER", "PROCUREMENT"],
  "YCD-003": ["ACCOUNTANT", "HR_MANAGER"],
  "YCD-004": ["ACCOUNTANT"],
  "YCD-005": ["CASHIER"],
  "YCD-006": ["WAREHOUSE", "TECHNICIAN"],
  "YCD-007": ["TECHNICIAN"],
  "YCD-008": ["WASH_SUPERVISOR"],
};

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
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المستخدمون والصلاحيات</h1>
          <p>ربط الموظفين بحسابات دخول فعلية وتحديد الأدوار مع منع تغيير صلاحيات المستخدم لنفسه.</p>
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
          suggestedRoleCodes: suggestedRolesByEmployeeCode[employee.code] ?? [],
          user: employee.user ? {
            id: employee.user.id,
            email: employee.user.email,
            status: employee.user.status,
            roleCodes: employee.user.roles.map((entry) => entry.role.code),
          } : null,
        }))}
      />
    </main>
  );
}
