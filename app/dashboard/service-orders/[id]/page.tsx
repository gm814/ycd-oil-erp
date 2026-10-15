import { companyConfig } from "@/lib/config";
import { productPriceRange } from "@/lib/product-pricing";
import { oilServiceReminder } from "@/lib/oil-service-interval";
import ActionForm from "@/app/dashboard/loyalty/action-form";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import OrderActions from "./order-actions";
import ShiftTransfer from "./shift-transfer";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { serviceOrderTotals } from "@/lib/service-order-totals";

export default async function ServiceOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;
  const [order, products] = await Promise.all([
    db.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        shift: true,
        vehicle: true,
        items: { include: { product: true }, orderBy: { id: "asc" } },
        invoice: { include: { payments: true, coupons: true } },
      },
    }),
    db.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, nameAr: true, salePrice: true, costPrice: true, costBasedPricing: true, category: true },
      orderBy: { nameAr: "asc" },
    }),
  ]);

  if (!order || order.branchId !== session.branchId) notFound();
  const canTransfer = hasPermission(session.permissions, PERMISSIONS.FINANCE_MANAGE) && hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_APPROVE);
  const openShifts = canTransfer && !order.invoice && ["DRAFT","OPEN","IN_PROGRESS"].includes(order.status) && (!order.shift || order.shift.closedAt)
    ? await db.shift.findMany({where:{branchId:order.branchId,closedAt:null}}) : [];

  const totals = serviceOrderTotals(order.items,companyConfig.vatRate);
  const subtotal = totals.subtotal.toNumber();

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/service-orders" className="backLink">← أوامر الخدمة</a>
          <h1>{order.orderNo}</h1>
          <p><a className="orderLink" href={`/dashboard/customers/${order.customerId}`}>{order.customer.name}</a> · {order.vehicle.plate} · العداد {order.odometer?.toLocaleString("ar-SA-u-nu-latn") ?? "—"}</p>
        </div>
        <div className="actionStack">
          <span className="statusBadge">{order.status}</span>
          {order.invoice && <a className="secondaryLink" href={`/dashboard/invoices/${order.invoice.id}#customer-package`}>تنزيل وطباعة ومشاركة مستندات العميل</a>}
          {order.status === "COMPLETED" && <a className="secondaryLink" href={`/dashboard/service-orders/${order.id}/reminder`}>تذكير الخدمة عبر واتساب</a>}
        </div>
      </div>

      {order.channel === "WASH" && <section className="panel"><h2>غسيل مباشر — برنامج الولاء</h2><a href={`/dashboard/loyalty/${order.customerId}`}>بطاقة العميل ورصيد الغسلات</a>{!order.invoice && order.status !== "CANCELLED" && order.items.length === 0 && <><p>لاستخدام المجانية، استبدل الرصيد أولًا ثم أضف أي خدمات إضافية وأصدر الفاتورة.</p><ActionForm action="redeem" values={{orderId:order.id}} label="استخدام غسلة الولاء المجانية" /></>}</section>}
      <section className="workGrid">
        <article className="panel">
          <h2>إضافة خدمة / مادة</h2>
          {openShifts.length === 1 && order.channel !== "PRICE_CORRECTION" && <ShiftTransfer orderId={order.id} orderNo={order.orderNo} previousShiftId={order.shiftId} targetShiftId={openShifts[0].id} targetOpenedAt={openShifts[0].openedAt.toLocaleString("ar-SA-u-nu-latn",{timeZone:"Asia/Riyadh"})} />}
          <OrderActions
            orderId={order.id}
            subtotal={subtotal}
            vatAmount={totals.vatAmount.toNumber()}
            invoiceTotal={totals.total.toNumber()}
            vatRate={companyConfig.vatRate}
            odometer={order.odometer}
            reminder={oilServiceReminder(order.odometer, order.items)}
            locked={Boolean(order.invoice) || order.status === "CANCELLED"}
            products={products.map((product) => ({
              id: product.id, sku: product.sku, nameAr: product.nameAr, category: product.category,
              salePrice: Number(product.salePrice),
              minPrice: productPriceRange(product)?.min.toNumber() ?? null,
              maxPrice: productPriceRange(product)?.max.toNumber() ?? null,
            }))}
          />
        </article>

        <article className="panel">
          <h2>بنود أمر الخدمة</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {order.items.map((item) => {
                  const lineTotal = Number(item.unitPrice) * Number(item.quantity) - Number(item.discount);
                  return (
                    <tr key={item.id}>
                      <td>{item.descriptionAr}</td>
                      <td>{Number(item.quantity).toLocaleString("ar-SA-u-nu-latn")}</td>
                      <td>{Number(item.unitPrice).toFixed(2)}</td>
                      <td>{Number(item.discount).toFixed(2)}</td>
                      <td>{lineTotal.toFixed(2)} ر.س</td>
                    </tr>
                  );
                })}
                {order.items.length === 0 && <tr><td colSpan={5} className="empty">لم تتم إضافة بنود بعد.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="orderTotal"><span>الإجمالي قبل الضريبة</span><b>{subtotal.toFixed(2)} ر.س</b></div>
          {order.invoice && (
            <div className="invoiceBox">
              <div><b>الفاتورة: <a className="orderLink" href={`/dashboard/invoices/${order.invoice.id}`}>{order.invoice.invoiceNo}</a></b><span>الإجمالي شامل الضريبة: {Number(order.invoice.total).toFixed(2)} ر.س</span></div>
              {order.invoice.coupons[0] && <div><b>كوبون الغسيل</b><span>{order.invoice.coupons[0].serial}</span></div>}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
