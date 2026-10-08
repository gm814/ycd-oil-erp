import ActionForm from "@/app/dashboard/loyalty/action-form";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import OrderActions from "./order-actions";

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
        vehicle: true,
        items: { include: { product: true }, orderBy: { id: "asc" } },
        invoice: { include: { payments: true, coupons: true } },
      },
    }),
    db.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, nameAr: true, salePrice: true, category: true },
      orderBy: { nameAr: "asc" },
    }),
  ]);

  if (!order || order.branchId !== session.branchId) notFound();

  const subtotal = order.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity) - Number(item.discount),
    0,
  );

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
          {order.status === "COMPLETED" && <a className="secondaryLink" href={`/dashboard/service-orders/${order.id}/reminder`}>تذكير الخدمة عبر واتساب</a>}
        </div>
      </div>

      {order.channel === "WASH" && <section className="panel"><h2>غسيل مباشر — برنامج الولاء</h2><a href={`/dashboard/loyalty/${order.customerId}`}>بطاقة العميل ورصيد الغسلات</a>{!order.invoice && order.status !== "CANCELLED" && order.items.length === 0 && <><p>لاستخدام المجانية، استبدل الرصيد أولًا ثم أضف أي خدمات إضافية وأصدر الفاتورة.</p><ActionForm action="redeem" values={{orderId:order.id}} label="استخدام غسلة الولاء المجانية" /></>}</section>}
      <section className="workGrid">
        <article className="panel">
          <h2>إضافة خدمة / مادة</h2>
          <OrderActions
            orderId={order.id}
            locked={Boolean(order.invoice) || order.status === "CANCELLED"}
            products={products.map((product) => ({
              ...product,
              salePrice: Number(product.salePrice),
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
