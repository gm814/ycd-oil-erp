import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { db } from "@/lib/db";

function badge(ok: boolean) {
  return <span className={ok ? "okBadge" : "alertBadge"}>{ok ? "جاهز" : "مطلوب"}</span>;
}

export default async function DeploymentReadinessPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const branch = await db.branch.findUnique({
    where: { id: session.branchId },
    select: { operationalStatus: true, nameAr: true },
  });
  if (!branch) redirect("/dashboard");

  const authSecret = process.env.AUTH_SECRET ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const preopeningOverride = process.env.ALLOW_PREOPENING_OPERATIONS === "true";
  const production = process.env.NODE_ENV === "production";
  const vercel = Boolean(process.env.VERCEL);
  const hostingProvider = vercel ? "Vercel" : (process.env.HOSTING_PROVIDER || "غير مرتبطة بعد");
  const checks = [
    {
      label: "اتصال قاعدة البيانات",
      ok: Boolean(databaseUrl),
      detail: databaseUrl ? "DATABASE_URL مضبوط دون إظهار بيانات الاتصال." : "DATABASE_URL غير مضبوط.",
    },
    {
      label: "سر جلسات الدخول",
      ok: authSecret.length >= 32,
      detail: authSecret.length >= 32 ? "AUTH_SECRET مضبوط بطول مناسب." : "يجب ضبط AUTH_SECRET عشوائي بطول 32 حرفًا على الأقل.",
    },
    {
      label: "قفل عمليات ما قبل التشغيل",
      ok: !preopeningOverride,
      detail: preopeningOverride ? "ALLOW_PREOPENING_OPERATIONS=true — غير مناسب للإنتاج." : "التجاوز غير مفعّل.",
    },
    {
      label: "وضع الإنتاج",
      ok: production,
      detail: production ? "NODE_ENV=production" : "هذه البيئة ليست Production حاليًا.",
    },
    {
      label: "بيئة الاستضافة",
      ok: vercel || Boolean(process.env.HOSTING_PROVIDER),
      detail: vercel ? "التطبيق يعمل داخل بيئة Vercel." : process.env.HOSTING_PROVIDER ? `التطبيق يعمل عبر ${process.env.HOSTING_PROVIDER}.` : "لم تُحدد منصة الاستضافة في هذا التشغيل.",
    },
  ];
  const readyCount = checks.filter((item) => item.ok).length;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/readiness" className="backLink">← جاهزية الافتتاح</a>
          <h1>جاهزية بيئة النشر الإنتاجي</h1>
          <p>فحص آمن لإعدادات البيئة دون عرض الأسرار أو رابط قاعدة البيانات.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>حالة الفرع</span><b>{branch.operationalStatus}</b></article>
        <article><span>فحوصات البيئة الجاهزة</span><b>{readyCount} / {checks.length}</b></article>
        <article><span>بيئة الاستضافة</span><b>{hostingProvider}</b></article>
        <article><span>التشغيل التجاري</span><b>{branch.operationalStatus === "LIVE" ? "مفعّل" : "مقفل"}</b></article>
      </section>

      <article className="panel inventoryPanel">
        <h2>فحوصات البيئة</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الفحص</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {checks.map((item) => (
                <tr key={item.label}>
                  <td><b>{item.label}</b></td>
                  <td>{badge(item.ok)}</td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h2>قاعدة الأمان قبل النشر</h2>
        <p>يمكن نشر نسخة PREOPENING للإعداد وإدخال البيانات على Vercel أو Docker، لكن لا تُفتح العمليات التجارية إلا بعد اكتمال بيانات التشغيل وUAT ثم اعتماد GO LIVE.</p>
        <p><a className="orderLink" href="/api/health" target="_blank" rel="noreferrer">فحص صحة التطبيق وقاعدة البيانات</a></p>
        <p className="muted">هذه الشاشة لا تعرض AUTH_SECRET أو DATABASE_URL أو أي قيمة سرية؛ تعرض حالة الإعداد فقط.</p>
      </article>
    </main>
  );
}
