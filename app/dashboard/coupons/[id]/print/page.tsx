import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

export default async function CouponPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;

  const coupon = await db.coupon.findFirst({
    where: { id, invoice: { serviceOrder: { branchId: session.branchId } } },
    include: {
      invoice: {
        include: {
          customer: true,
          serviceOrder: { include: { vehicle: true } },
        },
      },
    },
  });
  if (!coupon) notFound();
  const order = coupon.invoice.serviceOrder;

  return (
    <main className="workspace couponPrintWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/coupons" className="backLink">← كوبونات المغسلة</a>
        <PrintDocumentButton label="طباعة كوبون الغسيل" />
      </div>
      <article className="washCouponDocument">
        <YcdDocumentHeader title="كوبون غسيل سيارة مجاني" titleEn="FREE CAR WASH COUPON" number={coupon.serial} />
        <section className="couponHeroText">
          <span>عند تغيير زيت سيارتك</span>
          <b>احصل على خدمة غسيل سيارة مجانية</b>
          <small>Free Car Wash with Oil Change</small>
        </section>
        <section className="couponDataGrid">
          <div><span>نوع السيارة</span><b>{order.vehicle.make || "—"}</b></div>
          <div><span>الموديل</span><b>{[order.vehicle.model, order.vehicle.year].filter(Boolean).join(" · ") || "—"}</b></div>
          <div><span>رقم اللوحة</span><b>{order.vehicle.plate}</b></div>
          <div><span>العداد الحالي</span><b>{order.odometer?.toLocaleString("ar-SA") ?? "—"} كم</b></div>
          <div><span>تاريخ الخدمة</span><b>{coupon.issuedAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</b></div>
          <div><span>العميل</span><b>{coupon.invoice.customer.name}</b></div>
          <div><span>الحالة</span><b>{coupon.status}</b></div>
          <div><span>صالح حتى</span><b>{coupon.expiresAt?.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) ?? "حسب سياسة المركز"}</b></div>
        </section>
        <section className="couponTerms">
          <b>شروط الاستخدام</b>
          <span>يستخدم الكوبون مرة واحدة فقط، ويجب التحقق من رقمه داخل نظام YCD OIL قبل تنفيذ الغسيل.</span>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
