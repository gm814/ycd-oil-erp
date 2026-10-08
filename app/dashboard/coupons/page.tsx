import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import CouponRedeem from "./redeem-form";

export default async function CouponsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  if (!session.branchId) redirect("/dashboard");
  const agreements = await db.washAgreement.findMany({ where: { washBranchId: session.branchId, active: true }, select: { sourceBranchId: true } });
  const coupons = await db.coupon.findMany({
    where: { OR: [{ invoice: { serviceOrder: { branchId: session.branchId } } }, { invoice: { serviceOrder: { branchId: { in: agreements.map(a=>a.sourceBranchId) } } } }] },
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
        <article className="panel"><h2>استخدام كوبون</h2><p>افحص الكوبون ثم اعتمد الغسلة لتسجيل الاستخدام والمستحق مرة واحدة.</p>{hasPermission(session.permissions, PERMISSIONS.COUPON_REDEEM) && <CouponRedeem />}<a className="primaryLink" href="/dashboard/wash">خدمات الغسيل والمطالبات والتسويات</a></article>
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
                    <td>{coupon.issuedAt.toLocaleDateString("ar-SA-u-nu-latn")}</td>
                    <td>{coupon.usedAt?.toLocaleString("ar-SA-u-nu-latn") ?? "—"}</td>
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
