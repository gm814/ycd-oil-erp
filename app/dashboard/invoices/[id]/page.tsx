import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import PrintButton from "./print-button";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

const paymentLabels: Record<string, string> = {
  CASH: "نقدي",
  CARD: "شبكة / بطاقة",
  TRANSFER: "تحويل بنكي",
  CREDIT: "آجل",
};

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, serviceOrder: { branchId: session.branchId } },
    include: {
      customer: true,
      serviceOrder: {
        include: {
          vehicle: true,
          items: { include: { product: true } },
        },
      },
      payments: { orderBy: { paidAt: "asc" } },
      coupons: { orderBy: { issuedAt: "desc" } },
    },
  });

  if (!invoice) notFound();

  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = Math.max(Number(invoice.total) - paid, 0);

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/customers/${invoice.customerId}`} className="backLink">← ملف العميل</a>
        <PrintButton />
      </div>

      <article className="invoiceDocument">
        <header className="invoiceHeader">
          <div>
            <div className="logoPlaceholder">YCD <span>OIL</span></div>
            <b>{companyConfig.legalNameAr}</b>
            <p>{companyConfig.branch} · {companyConfig.phone}</p>
            <p>{companyConfig.email} · {companyConfig.website}</p>
          </div>
          <div className="invoiceTitle">
            <span>فاتورة ضريبية</span>
            <h1>{invoice.invoiceNo}</h1>
            <p>{invoice.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p>
          </div>
        </header>

        <section className="invoiceLegal">
          <div><span>الرقم الموحد</span><b>{companyConfig.unifiedNumber}</b></div>
          <div><span>السجل التجاري</span><b>{companyConfig.crNumber}</b></div>
          <div><span>الرقم الضريبي</span><b>{companyConfig.vatNumber}</b></div>
          <div><span>نسبة الضريبة</span><b>{(Number(invoice.vatRate) * 100).toFixed(0)}%</b></div>
        </section>

        <section className="invoiceParties">
          <div>
            <h3>بيانات العميل</h3>
            <p><span>الاسم:</span> <b>{invoice.customer.name}</b></p>
            <p><span>الجوال:</span> <b>{invoice.customer.phone || "—"}</b></p>
          </div>
          <div>
            <h3>بيانات السيارة والخدمة</h3>
            <p><span>اللوحة:</span> <b>{invoice.serviceOrder.vehicle.plate}</b></p>
            <p><span>السيارة:</span> <b>{[invoice.serviceOrder.vehicle.make, invoice.serviceOrder.vehicle.model, invoice.serviceOrder.vehicle.year].filter(Boolean).join(" · ") || "—"}</b></p>
            <p><span>العداد:</span> <b>{invoice.serviceOrder.odometer?.toLocaleString("ar-SA") ?? "—"} كم</b></p>
            <p><span>أمر الخدمة:</span> <a className="orderLink noPrint" href={`/dashboard/service-orders/${invoice.serviceOrderId}`}>{invoice.serviceOrder.orderNo}</a><b className="printOnly">{invoice.serviceOrder.orderNo}</b></p>
          </div>
        </section>

        <div className="tableWrap invoiceTable">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الخدمة / الصنف</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الخصم</th>
                <th>الإجمالي قبل الضريبة</th>
              </tr>
            </thead>
            <tbody>
              {invoice.serviceOrder.items.map((item, index) => {
                const lineTotal = Number(item.unitPrice) * Number(item.quantity) - Number(item.discount);
                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>
                      <b>{item.descriptionAr}</b>
                      {item.product?.sku && <small className="invoiceSku">{item.product.sku}</small>}
                    </td>
                    <td>{Number(item.quantity).toLocaleString("ar-SA")}</td>
                    <td>{money(Number(item.unitPrice))}</td>
                    <td>{money(Number(item.discount))}</td>
                    <td>{money(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="invoiceBottom">
          <div className="paymentSummary">
            <h3>الدفعات والتحصيل</h3>
            {invoice.payments.map((payment) => (
              <div key={payment.id}>
                <span>{paymentLabels[payment.method] || payment.method}</span>
                <b>{money(Number(payment.amount))}</b>
                <small>{payment.reference || "بدون مرجع"} · {payment.paidAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</small>
              </div>
            ))}
            {invoice.payments.length === 0 && <p className="empty">لا توجد دفعات مسجلة.</p>}
            {invoice.coupons.map((coupon) => (
              <p className="couponLine" key={coupon.id}>
                كوبون غسيل: <b>{coupon.serial}</b> · الحالة: {coupon.status}
              </p>
            ))}
          </div>

          <div className="invoiceTotals">
            <div><span>الإجمالي قبل الضريبة</span><b>{money(Number(invoice.subtotal))}</b></div>
            <div><span>الخصم</span><b>{money(Number(invoice.discount))}</b></div>
            <div><span>ضريبة القيمة المضافة</span><b>{money(Number(invoice.vatAmount))}</b></div>
            <div className="grandTotal"><span>الإجمالي شامل الضريبة</span><b>{money(Number(invoice.total))}</b></div>
            <div><span>المحصل</span><b>{money(paid)}</b></div>
            <div><span>المتبقي</span><b>{money(remaining)}</b></div>
          </div>
        </section>

        <footer className="invoiceFooter">
          <p>شكرًا لاختياركم YCD OIL — وجهتك الإبداعية لزيوت وخدمات السيارات.</p>
        </footer>
      </article>
    </main>
  );
}
