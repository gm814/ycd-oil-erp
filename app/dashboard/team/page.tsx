import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { operationalTeam } from "@/lib/operations";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (
    !hasPermission(session.permissions, PERMISSIONS.HR_VIEW) &&
    !hasPermission(session.permissions, PERMISSIONS.DASHBOARD_VIEW)
  ) redirect("/dashboard");

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>الهيكل التشغيلي والمسؤوليات</h1>
          <p>{companyConfig.legalNameAr} · {companyConfig.branch}</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="documentSourceNotice">
        <b>الهيكل التشغيلي المعتمد</b>
        <span>يعرض المسؤوليات التشغيلية الحالية، بينما تبقى صلاحيات النظام محكومة بـ RBAC وسجل التدقيق.</span>
      </section>

      <section className="teamGrid">
        {operationalTeam.map((member) => (
          <article className="teamCard" key={member.code}>
            <div className="teamCode">{member.code}</div>
            <h2>{member.nameAr}</h2>
            <b>{member.primaryRoleAr}</b>
            <div className="teamResponsibilities">
              {member.responsibilitiesAr.map((role) => <span key={role}>{role}</span>)}
            </div>
            <div className="teamResponsibilities">
              <small className="muted">أدوار النظام المعتمدة</small>
              {member.systemRolesAr.map((role) => <span key={role}>{role}</span>)}
            </div>
          </article>
        ))}
      </section>

      <article className="panel">
        <h2>مصفوفة الفصل المالي المعتمدة</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>المسار</th><th>الإعداد / التنفيذ</th><th>المراجعة / الاعتماد</th><th>الرقابة العليا</th></tr></thead>
            <tbody>
              <tr><td>المصروفات التشغيلية</td><td>هاني عبدالسلام الذبحاني</td><td>ضياء فرحان المخلافي</td><td>أبوبكر نبيل سيف</td></tr>
              <tr><td>المطابقة البنكية</td><td>هاني عبدالسلام الذبحاني</td><td>ضياء فرحان المخلافي</td><td>أبوبكر نبيل سيف</td></tr>
              <tr><td>الإقفال المالي</td><td>هاني عبدالسلام الذبحاني</td><td>ضياء فرحان المخلافي</td><td>أبوبكر نبيل سيف</td></tr>
              <tr><td>المشتريات</td><td>حمزة عبدالرحمن سعيد الذبحاني</td><td>حسب صلاحية الاعتماد وعدم تعارض مقدم الطلب</td><td>أبوبكر نبيل سيف</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted">النظام يمنع الاعتماد الذاتي في المسارات الحساسة حتى عند تعدد المسؤوليات الوظيفية لنفس الموظف.</p>
      </article>

      <article className="panel">
        <h2>مبدأ الفصل والرقابة</h2>
        <p>تعدد المسؤوليات الوظيفية لا يلغي الفصل داخل النظام بين إنشاء العملية واعتمادها وتنفيذها، خصوصًا المصروفات والمشتريات والإقفالات والفروقات المالية.</p>
      </article>
    </main>
  );
}
