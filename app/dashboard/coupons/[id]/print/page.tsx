import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import qrcode from "qrcode-generator";
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
  const status = coupon.status === "ACTIVE" && coupon.expiresAt && coupon.expiresAt < new Date() ? "EXPIRED" : coupon.status;
  const statusAr = { ACTIVE: "صالح للاستخدام", USED: "مستخدم", EXPIRED: "منتهي الصلاحية", CANCELLED: "ملغى" }[status];
  const qr = qrcode(0, "M");
  qr.addData(coupon.serial);
  qr.make();
  const date = (value: Date) => value.toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <main className="workspace couponPrintWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/coupons" className="backLink">← كوبونات المغسلة</a>
        <PrintDocumentButton label="طباعة كوبون الغسيل" />
      </div>
      <article className="goldCoupon">
        <div className="goldCouponBrand"><img src="/brand/ycd-logo-source.svg" alt="YCD OIL" /><b>{companyConfig.legalNameAr}</b><span lang="en" dir="ltr">OIL &amp; AUTO SERVICE</span></div>
        <h1>كوبون غسيل سيارة مجاني</h1><h2 lang="en" dir="ltr">FREE CAR WASH COUPON</h2>
        <p className="goldCouponOffer">مع تغيير زيت سيارتك<br /><span lang="en">Free Car Wash with Oil Change</span></p>
        <div className="goldCouponBody">
          <div className="goldCouponInfo">
            <div className="goldCouponFields">
              <div><span>نوع السيارة / Make</span><b>{order.vehicle.make || "غير مسجل"}</b></div>
              <div><span>السيارة / Model</span><b>{[order.vehicle.model, order.vehicle.year].filter(Boolean).join(" · ") || "غير مسجل"}</b></div>
              <div><span>العميل / Customer</span><b>{coupon.invoice.customer.name}</b></div>
              <div><span>اللوحة / Plate</span><b>{order.vehicle.plate}</b></div>
              <div><span>العداد / Odometer</span><b>{order.odometer?.toLocaleString("en-US") ?? "—"} كم</b></div>
              <div><span>الإصدار / Issued</span><b dir="ltr">{date(coupon.issuedAt)}</b></div>
              <div><span>صالح حتى / Valid until</span><b dir="ltr">{coupon.expiresAt ? date(coupon.expiresAt) : "حسب سياسة المركز"}</b></div>
            </div>
            <div className="goldCouponSerial"><div><span>الرقم التسلسلي / Serial</span><b dir="ltr">{coupon.serial}</b></div><strong>{statusAr} <span lang="en">| {status}</span></strong></div>
          </div>
          <div className="goldCouponQr"><div role="img" aria-label="رمز QR لرقم الكوبون" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }) }} /><small>امسح لإدخال رقم الكوبون<br />ثم تحقق داخل النظام</small></div>
        </div>
        <p className="goldCouponTerms">يُستخدم مرة واحدة بعد التحقق من صلاحيته في النظام. {status !== "ACTIVE" && <b>هذا الكوبون غير صالح للاستخدام.</b>}</p>
        <footer className="goldCouponFooter"><span>{companyConfig.branch}</span><span dir="ltr">{companyConfig.website}</span><span dir="ltr">{companyConfig.email}</span><span dir="ltr">{companyConfig.phone}</span></footer>
      </article>
      <style>{`
        .goldCoupon{position:relative;isolation:isolate;overflow:hidden;background:white;color:#55585d;border:2px solid #d49c24;border-radius:28px;padding:28px 30px 20px;box-shadow:0 5px 18px #0000000b;text-align:center}
        .goldCoupon:before,.goldCoupon:after{content:"";position:absolute;width:165px;height:165px;z-index:-1;pointer-events:none;border-radius:50%;border:20px solid #f4ba33;box-shadow:0 0 0 10px white,0 0 0 22px #bdbdbf,0 0 0 28px white,0 0 0 32px #f7d984}
        .goldCoupon:before{top:-115px;left:-105px}.goldCoupon:after{bottom:-120px;right:-110px}
        .goldCouponBrand{display:grid;justify-items:center;gap:6px}.goldCouponBrand img{width:235px;max-width:55%;height:auto}.goldCouponBrand b{font-size:18px}.goldCouponBrand span{font-size:15px;letter-spacing:2px}
        .goldCoupon h1{color:#a97008;font-size:34px;margin:18px 0 4px}.goldCoupon h2{font-size:20px;letter-spacing:2px;margin:0}.goldCouponOffer{font-size:15px;line-height:1.7;margin:10px 0 18px}
        .goldCouponBody{display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:16px;align-items:center}.goldCouponInfo{min-width:0}.goldCouponFields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.goldCouponFields>div{border:1px solid #e6c67d;border-radius:10px;padding:9px 6px;display:grid;gap:6px;overflow-wrap:anywhere}.goldCouponFields span,.goldCouponSerial span{font-size:11px}.goldCouponFields b{font-size:15px;color:#484b50}
        .goldCouponQr{border:1px dashed #939497;border-radius:12px;background:white;padding:9px}.goldCouponQr svg{display:block;width:100%;height:auto}.goldCouponQr small{display:block;font-size:10px;line-height:1.6}
        .goldCouponSerial{display:flex;justify-content:space-around;align-items:center;gap:8px;margin-top:10px;background:#fff8e9;border-radius:10px;padding:10px;flex-wrap:wrap}.goldCouponSerial>div{display:grid;gap:5px;min-width:0}.goldCouponSerial b{font-size:13px;overflow-wrap:anywhere}.goldCouponSerial strong{color:#865600;border:1px solid #d49c24;border-radius:8px;padding:7px;font-size:14px}
        .goldCouponTerms{font-size:11px;line-height:1.7;margin:14px 0 8px}.goldCouponFooter{display:flex;justify-content:space-around;gap:10px;flex-wrap:wrap;border-top:1px solid #d49c24;padding-top:12px;font-size:12px;background:transparent}
        @media(max-width:600px){.goldCoupon{padding:22px 14px 16px}.goldCoupon h1{font-size:25px}.goldCoupon h2{font-size:15px;letter-spacing:1px}.goldCouponBrand b{font-size:14px}.goldCouponBody{grid-template-columns:minmax(0,1fr) 100px;gap:8px}.goldCouponFields{grid-template-columns:repeat(2,minmax(0,1fr))}.goldCouponFields b{font-size:12px}.goldCouponSerial{flex-direction:column}.goldCouponFooter{font-size:10px}}
        @media print{.couponPrintWorkspace{max-width:none;padding:0;margin:0}.goldCoupon{width:150mm;height:100mm;max-width:none;padding:4mm;border-radius:4mm;box-shadow:none;break-inside:avoid;display:flex;flex-direction:column;justify-content:space-between;print-color-adjust:exact;-webkit-print-color-adjust:exact}.goldCouponBrand{gap:1mm}.goldCouponBrand img{width:32mm;max-height:15mm;object-fit:contain}.goldCouponBrand b{font-size:8pt;line-height:1.2}.goldCouponBrand span{font-size:7pt;letter-spacing:1px}.goldCoupon h1{font-size:17pt;line-height:1.15;margin:1mm 0}.goldCoupon h2{font-size:10pt;line-height:1.1;letter-spacing:1px}.goldCouponOffer{font-size:7pt;line-height:1.3;margin:1mm 0}.goldCouponBody{grid-template-columns:minmax(0,1fr) 27mm;gap:2mm}.goldCouponFields{grid-template-columns:repeat(3,minmax(0,1fr));gap:1mm}.goldCouponFields>div{padding:1mm;gap:.5mm;border-radius:2mm;line-height:1.2}.goldCouponFields span,.goldCouponSerial span{font-size:6pt}.goldCouponFields b{font-size:7.5pt;line-height:1.2}.goldCouponSerial{flex-direction:row;gap:1mm;margin-top:1mm;padding:1mm;flex-wrap:nowrap}.goldCouponSerial>div{gap:.5mm}.goldCouponSerial b{font-size:6.5pt}.goldCouponSerial strong{font-size:7pt;padding:1mm;white-space:nowrap}.goldCouponQr{padding:1mm}.goldCouponQr small{font-size:6pt;line-height:1.2}.goldCouponTerms{font-size:6pt;line-height:1.3;margin:1mm 0}.goldCouponFooter{font-size:6.5pt;padding-top:1.5mm;gap:1mm}.goldCoupon:before,.goldCoupon:after{width:90px;height:90px;border-width:10px}.goldCoupon:before{top:-70px;left:-65px}.goldCoupon:after{bottom:-75px;right:-65px}}
      `}</style>
    </main>
  );
}
