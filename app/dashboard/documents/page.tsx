import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { companyConfig } from "@/lib/config";

const groups = [
  {
    title: "المبيعات وخدمة السيارات",
    docs: [
      ["فاتورة ضريبية", "مؤتمت", "/dashboard/customers", "تُنشأ تلقائيًا من أمر الخدمة وتُطبع من الفاتورة."],
      ["أمر خدمة / بطاقة عمل", "مؤتمت", "/dashboard/service-orders", "بيانات العميل والسيارة والفني والبنود وحالة التنفيذ."],
      ["تذكير الخدمة القادمة", "مؤتمت", "/dashboard/service-orders", "التاريخ والعداد القادم مرتبطان بسجل السيارة."],
      ["كوبون غسيل مجاني", "مؤتمت", "/dashboard/coupons", "رقم تسلسلي وحالة استخدام واحدة مرتبطة بالفاتورة."],
      ["إشعار دائن / مرتجع", "مؤتمت", "/dashboard/customers", "مرتبط بالفاتورة والمرتجع والاسترداد."],
    ],
  },
  {
    title: "المشتريات والمخزون",
    docs: [
      ["طلب مشتريات", "مؤتمت", "/dashboard/procurement", "رقم طلب وبنود واعتمادات ومقارنة عروض."],
      ["أمر شراء", "مؤتمت", "/dashboard/procurement", "ينشأ بعد اعتماد العرض المختار."],
      ["محضر استلام مواد", "مؤتمت", "/dashboard/procurement", "مرتبط بأمر الشراء وحركة المخزون."],
      ["سند إدخال / إخراج مخزون", "مؤتمت", "/dashboard/inventory", "مرجع لكل حركة استلام أو صرف أو مرتجع أو تسوية."],
      ["محضر جرد مخزون", "قالب نظامي", "/dashboard/inventory", "يستخدم للتسوية الدورية وتوثيق الفروقات."],
    ],
  },
  {
    title: "المالية والرقابة",
    docs: [
      ["سند قبض", "مؤتمت", "/dashboard/finance/statement", "يُستخرج من تحصيل العميل أو أي حركة قبض."],
      ["سند صرف", "مؤتمت", "/dashboard/finance", "يُستخرج من المصروف أو سداد المورد أو العهدة."],
      ["طلب مصروف واعتماده", "مؤتمت", "/dashboard/finance", "طلب ← اعتماد مستقل ← صرف ← سجل رقابي."],
      ["كشف حركة مالية", "مؤتمت", "/dashboard/finance/statement", "كشف حسب الحساب والفترة مع الرصيد الجاري."],
      ["مطابقة بنكية", "مؤتمت", "/dashboard/finance", "رصيد النظام مقابل كشف البنك وحساب الفرق."],
      ["إقفال وردية", "مؤتمت", "/dashboard/shifts", "نقدي ومدى وتحويل وفروقات واعتماد."],
      ["إقفال مالي يومي / شهري", "مؤتمت", "/dashboard/finance/closes", "ملخص رقابي واعتماد وإقفال."],
    ],
  },
  {
    title: "الإدارة والموارد والأصول",
    docs: [
      ["ورقة رسمية A4", "جاهز للطباعة", "/dashboard/documents/letterhead", "هوية YCD OIL الرسمية للمخاطبات."],
      ["طلب عهدة وتسويتها", "مؤتمت", "/dashboard/custody", "طلب واعتماد وصرف وتسوية وإقفال."],
      ["مسير رواتب / قسيمة راتب", "مؤتمت", "/dashboard/hr", "فترة الرواتب وبنود الموظف وصافي المستحق."],
      ["أمر صيانة أصل", "مؤتمت", "/dashboard/assets", "العطل والتكلفة والتنفيذ والإقفال والصيانة القادمة."],
      ["نموذج حضور وانصراف", "مؤتمت", "/dashboard/hr", "سجل الموظف اليومي والتأخير والإضافي."],
      ["محضر تسليم واستلام أصل", "قالب نظامي", "/dashboard/assets", "توثيق عهدة الأصل وحالته عند التسليم والاستلام."],
    ],
  },
];

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>مركز المستندات والنماذج</h1>
          <p>النماذج الرسمية والمؤتمتة لشركة YCD OIL بنفس الهوية المعتمدة، وتُملأ من بيانات النظام بدل الإدخال اليدوي.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="documentSourceNotice">
        <b>الهوية المعتمدة داخل النظام</b>
        <span>الفاتورة · طلب المشتريات · سند القبض · سند الصرف · تذكير الخدمة · كوبون الغسيل · الورقة الرسمية · الختم والمواد التسويقية.</span>
      </section>

      <article className="panel">
        <h2>المصادر الرسمية المثبتة في بيانات النظام</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>المصدر</th><th>البيانات المثبتة</th><th>حالة الاستخدام</th></tr></thead>
            <tbody>
              <tr>
                <td>ملف هوية YCD OIL الرسمي</td>
                <td>الشعار الرسمي · #F18F21 · #F7A81D · #939497 · #BDBDBF</td>
                <td><span className="okBadge">مطبق في واجهات ومستندات النظام</span></td>
              </tr>
              <tr>
                <td>{companyConfig.bank.certificateSourceAr}</td>
                <td>
                  {companyConfig.bank.nameAr} · {companyConfig.bank.accountNameAr}<br />
                  <span dir="ltr">A/C {companyConfig.bank.accountNumber}</span><br />
                  <span dir="ltr">IBAN {companyConfig.bank.iban}</span>
                </td>
                <td><span className="okBadge">مرجع {companyConfig.bank.certificateReference} · {companyConfig.bank.certificateDate}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">هذه البيانات مرجعية داخلية للنظام ولا يتم استبدال الشعار أو بيانات الحساب باجتهادات تصميمية أو بيانات تقديرية.</p>
      </article>

      {groups.map((group) => (
        <article className="panel inventoryPanel" key={group.title}>
          <h2>{group.title}</h2>
          <div className="documentGrid">
            {group.docs.map(([name, status, href, description]) => (
              <a className="documentCard" href={href} key={name}>
                <div><b>{name}</b><span className={status === "قالب نظامي" ? "statusBadge" : "okBadge"}>{status}</span></div>
                <p>{description}</p>
                <small>فتح النموذج ←</small>
              </a>
            ))}
          </div>
        </article>
      ))}
    </main>
  );
}
