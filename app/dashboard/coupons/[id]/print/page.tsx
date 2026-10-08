import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CouponCard from "@/components/coupon-card";
import { couponViewUrl } from "@/lib/coupon-link";
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
  return <main className="workspace couponPrintWorkspace">
    <div className="invoiceActions noPrint">
      <a href="/dashboard/coupons" className="backLink">← كوبونات المغسلة</a>
      <PrintDocumentButton label="طباعة كوبون الغسيل" />
      <a href={couponViewUrl(coupon.serial)} target="_blank" rel="noopener noreferrer">فتح بطاقة العميل</a>
    </div>
    <CouponCard coupon={coupon} viewUrl={couponViewUrl(coupon.serial)} />
  </main>;
}
