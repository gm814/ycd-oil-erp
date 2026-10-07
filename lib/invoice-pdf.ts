import type { Prisma } from "@prisma/client";
import { companyConfig as company } from "./config";
import { buildZatcaPhase1QrPayload, buildZatcaPhase1QrSvg } from "./zatca";

export const invoicePdfInclude = {
  customer: true,
  serviceOrder: { include: { vehicle: true, items: { include: { product: true } } } },
  payments: { orderBy: { paidAt: "asc" as const } },
  coupons: { orderBy: { issuedAt: "desc" as const } },
  returns: { where: { status: "COMPLETED" as const }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.InvoiceInclude;
type Invoice = Prisma.InvoiceGetPayload<{ include: typeof invoicePdfInclude }>;

// Escape all database text, including characters that can introduce HTML or CSS.
export function pdfText(value: unknown): string {
  return String(value ?? "—").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const money = (value: unknown) => Number(value).toFixed(2);
const date = (value: Date) => pdfText(value.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }));
const methods: Record<string, string> = { CASH: "نقدي", CARD: "شبكة / بطاقة", TRANSFER: "تحويل بنكي", CREDIT: "آجل" };

export function invoicePdfHtml(invoice: Invoice, format: "a4" | "epson80", logo: string) {
  const receipt = format === "epson80";
  const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const returned = invoice.returns.reduce((sum, r) => sum + Number(r.total), 0);
  const refunded = invoice.returns.reduce((sum, r) => sum + Number(r.refundAmount), 0);
  const net = Math.max(Number(invoice.total) - returned, 0);
  const remaining = Math.max(net - (paid - refunded), 0);
  const qr = buildZatcaPhase1QrSvg(buildZatcaPhase1QrPayload({
    sellerName: company.legalNameAr, vatNumber: company.vatNumber, timestamp: invoice.createdAt,
    totalWithVat: Number(invoice.total), vatTotal: Number(invoice.vatAmount),
  }));
  const vehicle = invoice.serviceOrder.vehicle;
  const statuses: Record<string, string> = { PAID: "مسددة", PARTIALLY_PAID: "مسددة جزئيًا", ISSUED: "مستحقة", VOID: "ملغاة" };
  const row = (label: string, value: unknown) => `<tr><td>${label}</td><td class="number">${money(value)}</td></tr>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${pdfText(invoice.invoiceNo)}</title>
  <style>
  @page { size: ${receipt ? "80mm 297mm" : "A4"}; margin:${receipt ? "4mm" : "10mm 10mm 25mm"}; @bottom-center { content: element(contacts); } }
  * { box-sizing:border-box } body { font-family:"DejaVu Sans",sans-serif; color:#111; font-size:${receipt ? "8" : "9"}pt; line-height:1.5; margin:0; }
  h1 { font-size:${receipt ? "8" : "16"}pt; margin:2mm 0; } h2 { font-size:10pt; margin:1mm 0; } p { margin:1mm 0; }
  header { text-align:center; border-top:2mm solid #f18f21; padding-top:2mm; } .logo { width:${receipt ? "26" : "34"}mm; }
  .number { direction:ltr; unicode-bidi:embed; white-space:nowrap; } .muted { color:#555; font-size:8pt; }
  .details { width:100%; border-collapse:collapse; margin:3mm 0; } .details td { vertical-align:top; padding:2mm; border:1px solid #ddd; }
  .qr { text-align:center; margin:2mm 0; } .qr svg { width:30mm; height:30mm; }
  table.items { width:100%; border-collapse:collapse; table-layout:fixed; margin:3mm 0; } th { background:#f3f3f3; }
  th,td { text-align:right; overflow-wrap:anywhere; } .items th,.items td { border-bottom:1px solid #ddd; padding:1.5mm 1mm; font-size:${receipt ? "7" : "9"}pt; }
  tr { break-inside:avoid; } thead { display:table-header-group; } .items .description { width:${receipt ? "32" : "40"}%; }
  .totals { width:${receipt ? "100%" : "55%"}; margin:3mm 0 3mm auto; border-collapse:collapse; break-inside:avoid; }
  .totals td { padding:1mm; border-bottom:1px solid #ddd; } .total { background:#fff1d9; font-weight:bold; }
  .payment { border-bottom:1px solid #eee; padding:1mm 0; } footer { margin-top:3mm; border-top:1px solid #ddd; padding-top:2mm; font-size:7pt; text-align:center; }
  ${receipt ? ".details,.details tbody,.details tr,.details td { display:block; width:100%; } .items .number { white-space:normal; } .items th { font-size:6pt; padding:1.5mm .5mm; overflow-wrap:normal; }" : ".qr { float:left; margin:2mm 3mm; }"}
  .brand-header { display:table; width:100%; table-layout:fixed; direction:rtl; border-bottom:1px solid #ddd; padding-bottom:2mm; }
  .brand-header > div { display:table-cell; vertical-align:middle; width:38%; font-size:${receipt ? "5.5" : "9"}pt; }
  .brand-header .brand-logo { width:24%; text-align:center; } .brand-logo img { width:${receipt ? "17" : "30"}mm; }
  .brand-en { direction:ltr; text-align:left; } .brand-ar { text-align:right; }
  .closing { display:table; width:100%; margin-top:3mm; break-inside:avoid; }
  .closing .policy { display:table-cell; vertical-align:middle; padding-left:3mm; font-size:8pt; }
  .closing .qr { display:table-cell; width:30mm; float:none; margin:0; }
  footer.contacts { position:running(contacts); font-size:${receipt ? "6" : "8"}pt; direction:rtl; width:100%; }
  ${receipt ? "footer.contacts { position:static; }" : ""}
  </style></head><body>

${receipt ? "" : `  <footer class="contacts"><p>عنوان الشركة: ${pdfText(company.companyAddress)}</p><p>عنوان الفرع: ${pdfText(company.branchAddress)}</p><p dir="ltr">${company.phone} | ${company.email} | ${company.website}</p></footer>`}
  <div class="brand-header"><div class="brand-ar"><b>${pdfText(company.legalNameAr)}</b><p>السجل التجاري: ${company.crNumber}</p><p>الرقم الموحد: ${company.unifiedNumber}</p></div><div class="brand-logo"><img src="data:image/svg+xml;base64,${logo}" alt="YCD OIL"></div><div class="brand-en"><b>${pdfText(company.legalNameEn)}</b><p>CR: ${company.crNumber}</p><p>Unified No.: ${company.unifiedNumber}</p></div></div>
  <header>
  <h2>فاتورة ضريبية مبسطة</h2><h1 class="number">${pdfText(invoice.invoiceNo)}</h1>
  <p>${date(invoice.createdAt)} | ${pdfText(statuses[invoice.status] || invoice.status)}</p>
  ${invoice.dueAt ? `<p>الاستحقاق: ${date(invoice.dueAt)}</p>` : ""}</header>
  <p>الرقم الضريبي: <b class="number">${company.vatNumber}</b></p>
  <p>نسبة الضريبة: <span class="number">${money(Number(invoice.vatRate) * 100)}%</span></p>
  <div style="clear:both"></div>
  <table class="details"><tr><td><b>بيانات العميل</b><p>${pdfText(invoice.customer.name)}</p><p class="number">${pdfText(invoice.customer.phone)}</p></td>
  <td><b>بيانات السيارة والخدمة</b><p>${pdfText(vehicle.plate)}</p><p>${pdfText([vehicle.make,vehicle.model,vehicle.year].filter(Boolean).join(" · "))}</p>
  <p>العداد: ${pdfText(invoice.serviceOrder.odometer)} كم</p><p class="number">${pdfText(invoice.serviceOrder.orderNo)}</p></td></tr></table>
  ${receipt ? '<p class="muted">أسعار البنود وإجمالياتها قبل الضريبة (ر.س)</p>' : ''}
  <table class="items"><thead><tr><th class="description">الصنف / الخدمة</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>${receipt ? "الإجمالي" : "الإجمالي قبل الضريبة"}</th></tr></thead><tbody>
  ${invoice.serviceOrder.items.map(item => `<tr><td>${pdfText(item.descriptionAr)}${item.product ? `<p class="muted">${pdfText(item.product.sku)}</p>` : ""}</td><td class="number">${Number(item.quantity)}</td><td class="number">${money(item.unitPrice)}</td><td class="number">${money(item.discount)}</td><td class="number">${money(Number(item.unitPrice)*Number(item.quantity)-Number(item.discount))}</td></tr>`).join("")}
  </tbody></table>
  <table class="totals">${row("الإجمالي قبل الضريبة",invoice.subtotal)}${row("الخصم",invoice.discount)}${row("ضريبة القيمة المضافة",invoice.vatAmount)}
  <tr class="total"><td>الإجمالي شامل الضريبة (ر.س)</td><td class="number">${money(invoice.total)}</td></tr>
  ${returned ? row("مرتجعات / إشعارات دائنة",returned) : ""}${row("المحصل",paid)}${refunded ? row("مبالغ مستردة",refunded) : ""}${returned ? row("صافي قيمة الفاتورة",net) : ""}${row("المتبقي",remaining)}</table>
  <h2>الدفعات والتحصيل</h2>
  ${invoice.payments.map(p=>`<p class="payment">${pdfText(methods[p.method] || p.method)}: <span class="number">${money(p.amount)}</span> ر.س | ${date(p.paidAt)}${p.reference ? ` | ${pdfText(p.reference)}` : ""}</p>`).join("") || "<p>لا توجد دفعات مسجلة.</p>"}
  ${invoice.coupons.map(c=>`<p>كوبون غسيل: <span class="number">${pdfText(c.serial)}</span> | ${pdfText(c.status)}</p>`).join("")}
  ${invoice.returns.map(r=>`<p>مرتجع: ${pdfText(r.returnNo)} | ${date(r.createdAt)} | ${money(r.total)} ر.س | ${pdfText(r.reason)}</p>`).join("")}
  ${remaining > 0 ? `<p>السداد: ${pdfText(company.bank.nameAr)} | ${pdfText(company.bank.accountNameAr)}</p><p class="number">${company.bank.accountNumber} | ${company.bank.iban}</p>` : ""}
  <div class="closing"><div class="policy"><b>سياسة الخدمة</b><p>لا يوجد استرجاع أو استبدال بعد تنفيذ الخدمة. في حال وجود ملاحظة على الخدمة يرجى التواصل معنا خلال 7 أيام.</p><p>شكرًا لاختياركم YCD OIL</p></div><div class="qr">${qr}</div></div>
${receipt ? `  <footer class="contacts"><p>عنوان الشركة: ${pdfText(company.companyAddress)}</p><p>عنوان الفرع: ${pdfText(company.branchAddress)}</p><p dir="ltr">${company.phone} | ${company.email} | ${company.website}</p></footer>` : ""}
  </body></html>`;
}
