import { revalidatePath } from "next/cache";
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


async function prepareGeneralAccountant() {
  "use server";
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId || !hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)
    || !hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_APPROVE)) redirect("/dashboard");
  const branchId = session.branchId;
  const member = operationalTeam.find((entry) => entry.code === "YCD-004")!;
  let failed = false;
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { code: member.code } });
      // Never move or reactivate an existing employee as part of account preparation.
      if (existing && (existing.branchId !== branchId || !existing.active || existing.nameAr !== member.nameAr)) {
        throw new Error("EMPLOYEE_CONFLICT");
      }
      const role = await tx.role.findUnique({ where: { code: "GENERAL_ACCOUNTANT" } });
      if (!role) {
        const permissionCodes = ["integration.view","dashboard.view","invoice.issue","payment.receive","customer.view","credit.manage","sales_return.process","shift.close","shift.variance.approve","finance.close.review","supplier_invoice.approve_payment","finance.view","finance.manage","finance.group_funding","finance.expense.approve","finance.expense.pay","finance.bank_reconcile.review","finance.transfer","pos.settle","supplier_payment.execute","custody.approve","custody.close","hr.view","payroll.approve","payroll.pay","reports.view","audit.view"];
        const createdRole = await tx.role.create({ data: { code: "GENERAL_ACCOUNTANT", nameAr: "المحاسب العام" } });
        for (const code of permissionCodes) {
          const permission = await tx.permission.upsert({ where: { code }, update: {}, create: { code } });
          await tx.rolePermission.create({ data: { roleId: createdRole.id, permissionId: permission.id } });
        }
      }
      const employee = existing ?? await tx.employee.create({
        data: { code: member.code, nameAr: member.nameAr, jobTitleAr: member.primaryRoleAr, branchId },
      });
      await tx.auditLog.create({ data: {
        actorId: session.userId, action: "GENERAL_ACCOUNTANT_ACCESS_PREPARED",
        entityType: "Employee", entityId: employee.id,
        afterJson: { employeeCode: member.code, branchId, roleCode: "GENERAL_ACCOUNTANT",
          employeeCreated: !existing, roleCreated: !role },
      } });
    });
  } catch {
    failed = true;
  }
  revalidatePath("/dashboard/admin/users");
  redirect("/dashboard/admin/users?accountant=" + (failed ? "conflict" : "ready"));
}

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<{ accountant?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const params = await searchParams;
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
        <article><span>الموظفون النشطون</span><b>{employees.length.toLocaleString("ar-SA-u-nu-latn")}</b></article>
        <article><span>حسابات مفعلة</span><b>{employees.filter((employee) => employee.user?.status === "ACTIVE").length.toLocaleString("ar-SA-u-nu-latn")}</b></article>
        <article><span>بدون حساب دخول</span><b>{employees.filter((employee) => !employee.user).length.toLocaleString("ar-SA-u-nu-latn")}</b></article>
        <article><span>حسابات موقوفة</span><b>{employees.filter((employee) => employee.user?.status === "SUSPENDED").length.toLocaleString("ar-SA-u-nu-latn")}</b></article>
      </section>

      {params.accountant === "ready" && <p className="formNotice" role="status">تم تجهيز سجل ضياء ودور المحاسب العام. أنشئ حساب YCD-004 من بطاقته أدناه بكلمة مرور مؤقتة. إذا كان الحساب موجودًا، راجع دوره واحفظ إعداداته دون إعادة تعيين كلمة المرور.</p>}
      {params.accountant === "conflict" && <p className="formNotice" role="alert">تعذر التجهيز. قد يوجد سجل بالرمز YCD-004 مرتبط بفرع آخر أو ببيانات مختلفة، أو حدث خطأ في الحفظ. لم يتم تغيير الحسابات القائمة.</p>}
      {hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_APPROVE)
        && (!employees.some((employee) => employee.code === "YCD-004") || !roles.some((role) => role.code === "GENERAL_ACCOUNTANT"))
        && <article className="panel">
          <h2>تجهيز المحاسب العام — YCD-004</h2>
          <p>ضياء فرحان المخلافي — إضافة سجل الموظف ودور المحاسب العام، ثم إنشاء حساب دخوله من البطاقة أدناه. يشمل الدور اعتماد المطالبات وسدادها وفق الصلاحيات المعتمدة.</p>
          <form action={prepareGeneralAccountant}><button type="submit">تجهيز ضياء — المحاسب العام</button></form>
        </article>}

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
