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
  const order = await db.serviceOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      items: { include: { product: true }, orderBy: { id: "asc" } },
      invoice: { include: { payments: true } },
    },
  });

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
          <p>{order.customer.name} · {order.vehicle.plate} · العداد {order.odometer?.toLocaleString("ar-SA") ?? "—"}</p>
        </div>
        <span className="statusBadge">{order.status}</span>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>إضافة خدمة / مادة</h2>
          <OrderActions orderId={order.id} locked={Boolean(order.invoice) || order.status === "CANCELLED"} />
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
                      <td>{Number(item.quantity).toLocaleString("ar-SA")}</td>
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
              <b>الفاتورة: {order.invoice.invoiceNo}</b>
              <span>الإجمالي شامل الضريبة: {Number(order.invoice.total).toFixed(2)} ر.س</span>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
