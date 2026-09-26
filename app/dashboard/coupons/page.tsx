import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CouponRedeem from "./redeem-form";

export default async function CouponsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const coupons = await db.coupon.findMany({
    include: { invoice: { include: { customer: true } } },
    orderBy: { issuedAt: "desc" },
    take: 30,
  });

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>كوبونات الغسيل المجاني</h1>
          <p>التحقق من الكوبون واستخدامه مرة واحدة فقط مع سجل كامل للعملية.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="workGrid">
        <article className="panel"><h2>استخدام كوبون</h2><CouponRedeem /></article>
        <article className="panel">
          <h2>آخر الكوبونات</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الرقم</th><th>العميل</th><th>الحالة</th><th>الإصدار</th><th>الاستخدام</th><th>النموذج</th></tr></thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>{coupon.serial}</td>
                    <td>{coupon.invoice.customer.name}</td>
                    <td><span className={coupon.status === "ACTIVE" ? "okBadge" : "statusBadge"}>{coupon.status}</span></td>
                    <td>{coupon.issuedAt.toLocaleDateString("ar-SA")}</td>
                    <td>{coupon.usedAt?.toLocaleString("ar-SA") ?? "—"}</td>
                    <td><a className="orderLink" href={`/dashboard/coupons/${coupon.id}/print`}>طباعة الكوبون</a></td>
                  </tr>
                ))}
                {coupons.length === 0 && <tr><td colSpan={6} className="empty">لا توجد كوبونات مصدرة بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
