import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { couponSerialFromToken, couponViewUrl } from "@/lib/coupon-link";
import CouponCard from "@/components/coupon-card";
import PrintDocumentButton from "@/components/print-document-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "بطاقة كوبون الغسيل | YCD OIL", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function CouponViewPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  const serial=couponSerialFromToken(token);
  if(!serial) notFound();
  const coupon=await db.coupon.findUnique({where:{serial},select:{serial:true,status:true,issuedAt:true,expiresAt:true}});
  if(!coupon) notFound();
  return <main className="workspace couponPrintWorkspace" style={{maxWidth:980,margin:"0 auto"}}>
    <div className="invoiceActions noPrint"><PrintDocumentButton label="حفظ أو طباعة PDF" /></div>
    <CouponCard coupon={coupon} viewUrl={couponViewUrl(coupon.serial)} />
    <p className="noPrint">عرض البطاقة لا يستهلك الكوبون. يتم تأكيد الاستخدام لدى موظف المغسلة.</p>
  </main>;
}
