import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { permissionLabels } from "@/lib/permission-labels";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const groups = [
  {
    title: "الحسابات والصلاحيات",
    items: [
      { title: "المستخدمون والصلاحيات", description: "إنشاء الحسابات وتعديل اسم المستخدم والبريد وكلمة المرور والحالة والأدوار.", href: "/dashboard/admin/users", any: [PERMISSIONS.USER_MANAGE] },
      { title: "أمان حسابي", description: "تغيير كلمة مرور حسابك وإعدادات الأمان المتاحة.", href: "/dashboard/account/security", any: [PERMISSIONS.USER_MANAGE] },
      { title: "الفريق والمسؤوليات", description: "مراجعة الهيكل التشغيلي والمسؤوليات المعتمدة للفريق.", href: "/dashboard/team", any: [PERMISSIONS.HR_VIEW, PERMISSIONS.DASHBOARD_VIEW] },
    ],
  },
  {
    title: "إعدادات التشغيل والبيانات",
    items: [
      { title: "برنامج الولاء", description: "إعداد الغسلات المدفوعة والمجانية وبطاقات العملاء.", href: "/dashboard/loyalty", any: [PERMISSIONS.USER_MANAGE] },
      { title: "عروض المراكز والرسائل", description: "إدارة الحملات وموافقات العملاء وفتح رسائل SMS وواتساب.", href: "/dashboard/marketing", any: [PERMISSIONS.MARKETING_MANAGE] },
      { title: "كوبونات وتسويات الغسيل", description: "اتفاق المغسلة والمستحقات والمطالبات اليومية والسداد وكشف الحساب.", href: "/dashboard/wash", any: [PERMISSIONS.COUPON_REDEEM, PERMISSIONS.FINANCE_VIEW] },
      { title: "الإدارة والحوكمة", description: "الجاهزية والبنود المتبقية وقرار تفعيل التشغيل التجاري للمخوّلين.", href: "/dashboard/readiness", any: [PERMISSIONS.REPORTS_VIEW] },
      { title: "استيراد البيانات الافتتاحية", description: "قوالب الأصناف والخدمات والموردين والموظفين والجرد الافتتاحي.", href: "/dashboard/readiness/import", any: [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.PROCUREMENT_QUOTE, PERMISSIONS.HR_MANAGE] },
      { title: "الأصناف والخدمات والمخزون", description: "إدارة بيانات الأصناف والأسعار والكميات حسب صلاحياتك.", href: "/dashboard/inventory", any: [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_ISSUE] },
      { title: "الموظفون والرواتب", description: "بيانات الموظفين والرواتب والحضور.", href: "/dashboard/hr", any: [PERMISSIONS.HR_VIEW, PERMISSIONS.PAYROLL_PREPARE] },
      { title: "المالية والحسابات البنكية", description: "الحسابات المالية والحركات والمطابقات البنكية.", href: "/dashboard/finance", any: [PERMISSIONS.FINANCE_VIEW] },
      { title: "المشتريات والموردون", description: "بيانات الموردين ودورة المشتريات والتوريد.", href: "/dashboard/procurement", any: [PERMISSIONS.PROCUREMENT_REQUEST, PERMISSIONS.PROCUREMENT_QUOTE, PERMISSIONS.PROCUREMENT_APPROVE] },
    ],
  },
  {
    title: "الرقابة وفحص النظام",
    items: [
      { title: "سجل التدقيق", description: "مراجعة من نفّذ التغييرات ووقت تنفيذها وتفاصيلها المسجلة.", href: "/dashboard/reports/audit", any: [PERMISSIONS.AUDIT_VIEW] },
      { title: "التقارير والرقابة", description: "متابعة مؤشرات التشغيل والنتائج والتقارير.", href: "/dashboard/reports", any: [PERMISSIONS.REPORTS_VIEW] },
      { title: "اختبارات القبول التشغيلي", description: "مراجعة السيناريوهات ونتائجها وأدلتها قبل الإطلاق.", href: "/dashboard/readiness/uat", any: [PERMISSIONS.REPORTS_VIEW] },
      { title: "فحص بيئة النشر", description: "حالة إعدادات الإنتاج والاستضافة دون إظهار الأسرار.", href: "/dashboard/readiness/deployment", any: [PERMISSIONS.REPORTS_VIEW] },
      { title: "محضر جاهزية الإطلاق", description: "مراجعة بوابات الإطلاق وطباعة محضر الجاهزية.", href: "/dashboard/readiness/launch-report", any: [PERMISSIONS.REPORTS_VIEW] },
    ],
  },
];

export default async function SystemAdminPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId || !hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) redirect("/dashboard");
  const roles = await db.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { nameAr: "asc" },
  });
  const permissionCount = new Set(roles.flatMap((role) => role.permissions.map((entry) => entry.permission.code))).size;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <Link href="/dashboard" className="backLink">← لوحة التحكم</Link>
          <h1>مدير النظام</h1>
          <p>مركز إدارة الحسابات والصلاحيات وإعدادات التشغيل والرقابة ومتابعة التطوير.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>
      <section className="kpis reportKpis">
        <article><span>المستخدم الحالي</span><b>{session.name}</b></article>
        <article><span>الأدوار المعتمدة</span><b>{roles.length}</b></article>
        <article><span>الصلاحيات المرتبطة بالأدوار</span><b>{permissionCount}</b></article>
        <article><span>صلاحيات حسابك</span><b>{session.permissions.length}</b></article>
      </section>
      {groups.map((group) => {
        const items = group.items.filter((item) => item.any.some((permission) => hasPermission(session.permissions, permission)));
        if (!items.length) return null;
        return (
          <section className="panel" key={group.title} aria-label={group.title}>
            <h2>{group.title}</h2>
            <div className="teamGrid">
              {items.map((item) => (
                <article className="teamCard" key={item.href}>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.description}</p>
                  <Link prefetch={false} className="primaryLink" href={item.href}>فتح {item.title}</Link>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      <section className="panel" aria-label="دليل الصلاحيات">
        <h2>دليل الأدوار وجميع صلاحياتها</h2>
        <p className="muted">اعرض صلاحيات كل دور هنا، وعيّن الأدوار للحسابات من المستخدمين والصلاحيات. تعريف الأدوار نفسه يُدار ضمن تطوير النظام.</p>
        {roles.map((role) => (
          <details key={role.id} className="panel">
            <summary>{role.nameAr} — {role.permissions.length} صلاحية</summary>
            <ul>{role.permissions.map(({ permission }) => <li key={permission.id}>{permissionLabels[permission.code] ?? permission.code} <small dir="ltr">({permission.code})</small></li>)}</ul>
          </details>
        ))}
      </section>
      <section className="panel" aria-label="التطوير والتحديثات">
        <h2>التطوير والتحديثات</h2>
        <p>متابعة تطوير النظام ومراجعة التحديثات ونتائج الفحوصات عبر مستودع المشروع. تتطلب هذه الأدوات حساب GitHub مخوّلًا؛ نشر التعديلات يتم بعد مراجعتها واعتمادها.</p>
        <div className="actionStack">
          <a className="secondaryLink" href="https://github.com/gm814/ycd-oil-erp/pulls" target="_blank" rel="noreferrer">مراجعة تحديثات النظام ↗</a>
          <a className="secondaryLink" href="https://github.com/gm814/ycd-oil-erp/actions" target="_blank" rel="noreferrer">نتائج الفحوصات الآلية ↗</a>
          <a className="secondaryLink" href="https://github.com/gm814/ycd-oil-erp/issues" target="_blank" rel="noreferrer">طلبات التطوير والمشكلات ↗</a>
        </div>
      </section>
    </main>
  );
}
