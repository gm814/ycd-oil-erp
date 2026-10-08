import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { buildZatcaPhase1QrPayload, buildZatcaPhase1QrSvg } from "@/lib/zatca";
import BuyerForm from "./buyer-form";
import PrintButton from "./print-button";
import CollectionForm from "./collection-form";
import SalesReturnForm from "./sales-return-form";

function money(value: number) {
  return value.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
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
      returns: {
        where: { status: "COMPLETED" },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!invoice) notFound();

  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const returnedTotal = invoice.returns.reduce((sum, item) => sum + Number(item.total), 0);
  const refunded = invoice.returns.reduce((sum, item) => sum + Number(item.refundAmount), 0);
  const effectiveTotal = Math.max(Number(invoice.total) - returnedTotal, 0);
  const netPaid = Math.max(paid - refunded, 0);
  const remaining = Math.max(effectiveTotal - netPaid, 0);
  const zatcaQrPayload = buildZatcaPhase1QrPayload({
    sellerName: companyConfig.legalNameAr,
    vatNumber: companyConfig.vatNumber,
    timestamp: invoice.createdAt,
    totalWithVat: Number(invoice.total),
    vatTotal: Number(invoice.vatAmount),
  });
  const zatcaQrSvg = buildZatcaPhase1QrSvg(zatcaQrPayload);
  const canCollect = hasPermission(session.permissions, PERMISSIONS.PAYMENT_RECEIVE);
  const canReturn = hasPermission(session.permissions, PERMISSIONS.SALES_RETURN_PROCESS);
  const returnedByItem = new Map<string, number>();
  for (const salesReturn of invoice.returns) {
    for (const item of salesReturn.items) {
      returnedByItem.set(item.serviceOrderItemId, (returnedByItem.get(item.serviceOrderItemId) ?? 0) + Number(item.quantity));
    }
  }

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/customers/${invoice.customerId}`} className="backLink">← ملف العميل</a>
        <PrintButton invoiceId={invoice.id} />
      </div>

      <article className="invoiceDocument">
        <header className="invoiceBilingualHeader">
          <div className="invoiceNameAr"><b>{companyConfig.legalNameAr}</b><p>السجل التجاري: <b dir="ltr">{companyConfig.crNumber}</b></p><p>الرقم الموحد: <b dir="ltr">{companyConfig.unifiedNumber}</b></p></div>
          <img className="invoiceBrandLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
          <div className="invoiceNameEn" lang="en" dir="ltr"><b>{companyConfig.legalNameEn}</b><p>CR: {companyConfig.crNumber}</p><p>Unified No.: {companyConfig.unifiedNumber}</p></div>
        </header>
        <section className="invoiceHeading">
          <div className="invoiceTitle">
            <span>فاتورة ضريبية مبسطة</span>
            <h1>{invoice.invoiceNo}</h1>
            <p>{invoice.createdAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p>
            <p><b>الحالة:</b> {invoice.status === "PAID" ? "مسددة" : invoice.status === "PARTIALLY_PAID" ? "مسددة جزئيًا" : invoice.status === "ISSUED" ? "مستحقة" : invoice.status}</p>
            {invoice.dueAt && <p><b>تاريخ الاستحقاق:</b> {invoice.dueAt.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p>}
          </div>
        </section>

        <section className="invoiceLegal">
          <div><span>الرقم الضريبي</span><b>{companyConfig.vatNumber}</b></div>
          <div><span>نسبة الضريبة</span><b>{(Number(invoice.vatRate) * 100).toFixed(0)}%</b></div>
        </section>

        <section className="invoiceParties">
          <div>
            <h3>بيانات العميل</h3>
            <p><span>الاسم:</span> <b>{invoice.customer.name}</b></p>
            <p><span>الجوال:</span> <b>{invoice.customer.phone || "—"}</b></p>
            {invoice.buyerCompanyName && <p><span>الشركة / المؤسسة:</span> <b>{invoice.buyerCompanyName}</b></p>}
            {invoice.buyerVatNumber && <p><span>الرقم الضريبي:</span> <b dir="ltr">{invoice.buyerVatNumber}</b></p>}
            {hasPermission(session.permissions, PERMISSIONS.INVOICE_ISSUE) && <BuyerForm invoiceId={invoice.id} companyName={invoice.buyerCompanyName} vatNumber={invoice.buyerVatNumber} canRenumber={hasPermission(session.permissions, PERMISSIONS.USER_MANAGE) && !invoice.invoiceNo.startsWith("YCD-")} />}

          </div>
          <div>
            <h3>بيانات السيارة والخدمة</h3>
            <p><span>اللوحة:</span> <b>{invoice.serviceOrder.vehicle.plate}</b></p>
            <p><span>السيارة:</span> <b>{[invoice.serviceOrder.vehicle.make, invoice.serviceOrder.vehicle.model, invoice.serviceOrder.vehicle.year].filter(Boolean).join(" · ") || "—"}</b></p>
            <p><span>العداد:</span> <b>{invoice.serviceOrder.odometer?.toLocaleString("ar-SA-u-nu-latn") ?? "—"} كم</b></p>
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
                    <td>{Number(item.quantity).toLocaleString("ar-SA-u-nu-latn")}</td>
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
                <small>{payment.reference || "بدون مرجع"} · {payment.paidAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</small>
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
            <div><span>مرتجعات / إشعارات دائنة</span><b>{money(returnedTotal)}</b></div>
            <div><span>المحصل</span><b>{money(paid)}</b></div>
            <div><span>مبالغ مستردة</span><b>{money(refunded)}</b></div>
            <div><span>صافي قيمة الفاتورة</span><b>{money(effectiveTotal)}</b></div>
            <div><span>المتبقي</span><b>{money(remaining)}</b></div>
          </div>
        </section>

        {remaining > 0 && canCollect && (
          <section className="noPrint invoiceCollection">
            <CollectionForm invoiceId={invoice.id} remaining={remaining} />
          </section>
        )}

        {invoice.returns.length > 0 && (
          <section className="returnHistory">
            <h3>المرتجعات والتسويات</h3>
            {invoice.returns.map((salesReturn) => (
              <div className="returnHistoryRow" key={salesReturn.id}>
                <div><b>{salesReturn.returnNo}</b><small>{salesReturn.createdAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</small></div>
                <div><span>قيمة المرتجع</span><b>{money(Number(salesReturn.total))}</b></div>
                <div><span>المبلغ المسترد</span><b>{money(Number(salesReturn.refundAmount))}</b></div>
                <div><span>السبب</span><b>{salesReturn.reason}</b></div>
              </div>
            ))}
          </section>
        )}

        {canReturn && invoice.status !== "VOID" && invoice.serviceOrder.items.some((item) => (returnedByItem.get(item.id) ?? 0) < Number(item.quantity)) && (
          <section className="noPrint invoiceCollection">
            <SalesReturnForm
              invoiceId={invoice.id}
              items={invoice.serviceOrder.items.map((item) => ({
                id: item.id,
                descriptionAr: item.descriptionAr,
                quantity: Number(item.quantity),
                returnedQuantity: returnedByItem.get(item.id) ?? 0,
                productCategory: item.product?.category ?? null,
              }))}
            />
          </section>
        )}

        {remaining > 0 && (
          <section className="invoiceBankDetails">
            <h3>بيانات السداد البنكي</h3>
            <div><span>البنك</span><b>{companyConfig.bank.nameAr}</b></div>
            <div><span>اسم الحساب</span><b>{companyConfig.bank.accountNameAr}</b></div>
            <div><span>رقم الحساب</span><b dir="ltr">{companyConfig.bank.accountNumber}</b></div>
            <div><span>IBAN</span><b dir="ltr">{companyConfig.bank.iban}</b></div>
          </section>
        )}

        <div className="invoiceClosing">
          <section className="invoicePolicy"><b>سياسة الخدمة</b><p>لا يوجد استرجاع أو استبدال بعد تنفيذ الخدمة. في حال وجود ملاحظة على الخدمة يرجى التواصل معنا خلال 7 أيام.</p></section>
          <div className="invoiceQr" aria-label="رمز الاستجابة السريعة للفاتورة" dangerouslySetInnerHTML={{ __html: zatcaQrSvg }} />
        </div>
        <footer className="invoiceFooter">
          <div className="invoiceAddresses"><div><p>عنوان الشركة: {companyConfig.companyAddress}</p><p>عنوان الفرع: {companyConfig.branchAddress}</p></div><div lang="en" dir="ltr"><p>Company: Riyadh - Tuwaiq District</p><p>Branch: Riyadh - Tuwaiq District - Ahmad Ibn Al Khattab Street</p></div></div>
          <p dir="ltr">{companyConfig.phone} · {companyConfig.email} · {companyConfig.website}</p>
        </footer>
      </article>
    </main>
  );
}
