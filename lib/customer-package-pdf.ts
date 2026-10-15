import type { Prisma } from "@prisma/client";
import qrcode from "qrcode-generator";
import { invoicePdfHtml, invoicePdfInclude, pdfText as esc } from "./invoice-pdf";
import { companyConfig as company } from "./config";
import { couponViewUrl } from "./coupon-link";
import { oilServiceReminder } from "./oil-service-interval";
type Invoice = Prisma.InvoiceGetPayload<{ include: typeof invoicePdfInclude }>;
export function customerPackageHtml(invoice: Invoice, format: "a4" | "epson80", logo: string) {
  const order = invoice.serviceOrder, vehicle = order.vehicle;
  const history = order.histories[0];
  const nextKm = history?.nextServiceKm ?? oilServiceReminder(order.odometer, order.items).nextKm;
  const date = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" });
  const field = (label: string, value: unknown) => `<div class="package-field"><span>${label}</span><b>${esc(value)}</b></div>`;
  const branding = `<img class="package-logo" src="data:image/svg+xml;base64,${logo}" alt="YCD OIL">`;
  const contacts = `<div class="package-contacts" dir="ltr">${esc(company.phone)}<br>${esc(company.website)}</div>`;
  const car = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" · ");
  const oil = order.items.filter(i => i.product?.category === "OIL").map(i => i.descriptionAr).join("، ");
  const reminder = `<section class="package-sheet"><article class="package-card">${branding}<h1>تذكير الخدمة القادمة</h1><p class="package-en">NEXT SERVICE REMINDER</p>
    ${field("العميل", invoice.customer.name)}${field("السيارة", car || "غير مسجلة")}${field("اللوحة", vehicle.plate)}
    <div class="package-highlight">${field("العداد القادم · كم", nextKm?.toLocaleString("en-US") ?? "لم يُحدد")}${history?.nextServiceAt ? field("التاريخ القادم", date(history.nextServiceAt)) : ""}</div>
    ${field("العداد الحالي · كم", order.odometer?.toLocaleString("en-US") ?? "غير مسجل")}${field("تاريخ الخدمة", date(invoice.createdAt))}${field("الخدمة / الزيت", oil || "خدمة السيارة")}${contacts}</article></section>`;
  const activeCoupons = invoice.coupons.filter(c => c.status === "ACTIVE" && (!c.expiresAt || c.expiresAt > new Date()));
  const couponPages = activeCoupons.map(c => {
    const qr = qrcode(0, "M"); qr.addData(couponViewUrl(c.serial), "Byte"); qr.make();
    return `<section class="package-sheet package-coupon"><article class="package-card">${branding}<h1>كوبون غسيل سيارة مجاني</h1><p class="package-en">FREE CAR WASH</p>
      ${field("رقم الكوبون", c.serial)}${field("العميل", invoice.customer.name)}${field("السيارة", car)}${field("اللوحة", vehicle.plate)}${field("الفاتورة", invoice.invoiceNo)}${field("صالح حتى", c.expiresAt ? date(c.expiresAt) : "حسب سياسة المركز")}
      <div class="package-qr"><img alt="QR" src="data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true })).toString("base64")}" /></div>
      <p>امسح للتحقق من صلاحية الكوبون.</p><p>يستخدم مرة واحدة فقط للسيارة المسجلة. إعادة طباعة الكوبون لا تمنح غسلة إضافية.</p>${contacts}</article></section>`;
  }).join("");
  const css = `<style>
    @page package { size: ${format === "epson80" ? "80mm 180mm" : "A4"}; margin: 4mm; @bottom-center { content: none; } }
    @page coupon { size: ${format === "epson80" ? "80mm 210mm" : "A4"}; margin:4mm; @bottom-center { content:none; } }
    .package-coupon { page:coupon !important; }
    .package-sheet { page: package; break-before:page; direction:ltr; text-align:center; padding-left:${format === "epson80" ? "0" : "51mm"}; }
    .package-card { display:block; direction:rtl; width:${format === "epson80" ? "72mm" : "100mm"}; margin:0; padding:3mm; border:.4mm solid #c49b42; border-radius:3mm; overflow-wrap:anywhere; }
    .package-logo { width:32mm; height:17mm; object-fit:contain; }
    .package-card h1 { color:#94690c; font-size:14pt; margin:2mm 0; }
    .package-en { color:#60646b; font-size:8pt; letter-spacing:1px; }
    .package-field { break-inside:avoid; padding:1.3mm 0; border-bottom:.2mm solid #eee; }
    .package-field span { display:block; color:#666; font-size:8pt; }
    .package-field b { display:block; font-size:11pt; line-height:1.35; font-weight:bold; }
    .package-highlight { background:#fff7e4; border:.3mm solid #dfbd72; margin:2mm 0; }
    .package-highlight b { font-size:16pt; }
    .package-qr { direction:ltr; break-inside:avoid; text-align:center; margin:2mm 0; width:100%; height:32mm; }
    .package-qr img { display:inline-block; width:32mm; height:32mm; }
    .package-contacts { break-inside:avoid; border-top:.4mm solid #c49b42; padding-top:2mm; margin-top:2mm; font-size:9pt; }
    .package-card p { font-size:8pt; line-height:1.5; }
  </style>`;
  return invoicePdfHtml(invoice, format, logo).replace("</head>", `${css}</head>`).replace("</body>", `${reminder}${couponPages}</body>`);
}
