import { redirect } from "next/navigation";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import LogoutButton from "./logout-button";

const kpis = [
  ["المبيعات اليوم", "0.00 ر.س"],
  ["السيارات المستلمة", "0"],
  ["إيرادات المغسلة", "0.00 ر.س"],
  ["المصروفات", "0.00 ر.س"],
];

const modules = [
  ["الورديات والإقفال اليومي", "/dashboard/shifts"],
  ["استقبال السيارات وأوامر الخدمة", "/dashboard/service-orders"],
  ["الزيوت وخدمات السيارات", "/dashboard/service-orders"],
  ["كوبونات المغسلة", "/dashboard/coupons"],
  ["المبيعات والعملاء", "#"],
  ["المشتريات والتوريد", "#"],
  ["المخزون والزيوت والفلاتر", "/dashboard/inventory"],
  ["المالية والبنوك", "#"],
  ["العهد", "#"],
  ["الموظفون والرواتب", "#"],
  ["الأصول والصيانة", "#"],
  ["التقارير والرقابة", "#"],
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logoPlaceholder">YCD <span>OIL</span></div>
          <small>ERP & Operations</small>
        </div>
        <nav>
          <strong>لوحة التحكم</strong>
          {modules.map(([item, href]) => <a href={href} key={item}>{item}</a>)}
        </nav>
      </aside>

      <section className="content">
        <header>
          <div>
            <h1>لوحة الإدارة العامة</h1>
            <p>{companyConfig.legalNameAr}</p>
          </div>
          <div className="userbar">
            <div className="branch">{session.name} · {companyConfig.branch}</div>
            <LogoutButton />
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">YCD OIL ERP & Operations</span>
            <h2>تشغيل منظم، رقابة لحظية، وقرار مبني على البيانات.</h2>
            <p>الواجهة التشغيلية للفرع الأول – الرياض - حي طويق.</p>
          </div>
          <a className="primaryLink" href="/dashboard/shifts">إدارة الوردية</a>
        </section>

        <section className="kpis">
          {kpis.map(([label, value]) => (
            <article key={label}><span>{label}</span><b>{value}</b></article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <h3>الموافقات المعلقة</h3>
            <p className="empty">لا توجد موافقات معلقة حاليًا.</p>
          </article>
          <article className="panel">
            <h3>تنبيهات التشغيل</h3>
            <p className="empty">ستظهر هنا تنبيهات المخزون والعهد والإقفال.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
