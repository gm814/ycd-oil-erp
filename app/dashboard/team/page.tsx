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
          </article>
        ))}
      </section>

      <article className="panel">
        <h2>مبدأ الفصل والرقابة</h2>
        <p>تعدد المسؤوليات الوظيفية لا يلغي الفصل داخل النظام بين إنشاء العملية واعتمادها وتنفيذها، خصوصًا المصروفات والمشتريات والإقفالات والفروقات المالية.</p>
      </article>
    </main>
  );
}
