import { companyConfig } from "@/lib/config";

const kpis = [
  ["المبيعات اليوم", "0.00 ر.س"],
  ["السيارات المستلمة", "0"],
  ["إيرادات المغسلة", "0.00 ر.س"],
  ["المصروفات", "0.00 ر.س"],
];

const modules = [
  "التشغيل اليومي",
  "الزيوت وخدمات السيارات",
  "مغاسل السيارات",
  "المبيعات والعملاء",
  "المشتريات والتوريد",
  "المخزون",
  "المالية والبنوك",
  "العهد",
  "الموظفون والرواتب",
  "الأصول والصيانة",
  "التقارير والرقابة",
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logoPlaceholder">YCD <span>OIL</span></div>
          <small>ضع ملف الشعار الأصلي في public/brand/ycd-oil-logo.*</small>
        </div>
        <nav>
          <strong>لوحة التحكم</strong>
          {modules.map((item) => <a href="#" key={item}>{item}</a>)}
        </nav>
      </aside>

      <section className="content">
        <header>
          <div>
            <h1>لوحة الإدارة العامة</h1>
            <p>{companyConfig.legalNameAr}</p>
          </div>
          <div className="branch">{companyConfig.branch}</div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">YCD OIL ERP & Operations</span>
            <h2>تشغيل منظم، رقابة لحظية، وقرار مبني على البيانات.</h2>
            <p>النسخة التأسيسية للنظام — واجهة عربية RTL وهوية YCD OIL المعتمدة.</p>
          </div>
          <button>فتح وردية جديدة</button>
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
