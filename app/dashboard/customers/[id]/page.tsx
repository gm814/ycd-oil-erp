import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

const statusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  OPEN: "مفتوح",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

export default async function CustomerDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const branchId = session.branchId;

  const customer = await db.customer.findFirst({
    where: { id, serviceOrders: { some: { branchId } } },
    include: {
      vehicles: {
        where: { serviceOrders: { some: { branchId } } },
        orderBy: { plate: "asc" },
      },
      serviceOrders: {
        where: { branchId },
        include: {
          vehicle: true,
          items: { include: { product: true } },
          histories: { orderBy: { createdAt: "desc" } },
          invoice: {
            include: {
              payments: { orderBy: { paidAt: "asc" } },
              coupons: { orderBy: { issuedAt: "desc" } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) notFound();

  const invoices = customer.serviceOrders.flatMap((order) => order.invoice ? [order.invoice] : []);
  const totalSales = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const totalPaid = invoices.reduce(
    (sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + Number(payment.amount), 0),
    0,
  );
  const balance = Math.max(totalSales - totalPaid, 0);

  const vehicleSummaries = customer.vehicles.map((vehicle) => {
    const orders = customer.serviceOrders.filter((order) => order.vehicleId === vehicle.id);
    const completed = orders.filter((order) => order.status === "COMPLETED");
    const lastOrder = completed[0] ?? orders[0] ?? null;
    const lastOilOrder = completed.find((order) =>
      order.items.some((item) => item.product?.category === "OIL"),
    ) ?? null;
    const latestHistory = orders.flatMap((order) => order.histories)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

    return { vehicle, orders, lastOrder, lastOilOrder, latestHistory };
  });

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/customers" className="backLink">← المبيعات والعملاء</a>
          <h1>ملف العميل: {customer.name}</h1>
          <p>الجوال: {customer.phone || "غير مسجل"} · عدد السيارات: {customer.vehicles.length.toLocaleString("ar-SA")}</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="kpis">
        <article><span>عدد الزيارات</span><b>{customer.serviceOrders.length.toLocaleString("ar-SA")}</b></article>
        <article><span>إجمالي الفواتير</span><b>{money(totalSales)}</b></article>
        <article><span>إجمالي المحصل</span><b>{money(totalPaid)}</b></article>
        <article><span>الرصيد المتبقي</span><b>{money(balance)}</b></article>
      </section>

      <section className="vehicleCards">
        {vehicleSummaries.map(({ vehicle, orders, lastOrder, lastOilOrder, latestHistory }) => (
          <article className="panel vehicleCard" key={vehicle.id}>
            <div className="vehicleCardHead">
              <div>
                <span className="plateTag">{vehicle.plate}</span>
                <h2>{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" · ") || "بيانات المركبة غير مكتملة"}</h2>
              </div>
              <b>{vehicle.currentOdometer?.toLocaleString("ar-SA") ?? "—"} كم</b>
            </div>
            <div className="vehicleFacts">
              <div><span>عدد الزيارات</span><b>{orders.length.toLocaleString("ar-SA")}</b></div>
              <div>
                <span>آخر خدمة</span>
                <b>{lastOrder ? lastOrder.createdAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—"}</b>
              </div>
              <div>
                <span>آخر تغيير زيت</span>
                <b>{lastOilOrder ? lastOilOrder.createdAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—"}</b>
              </div>
              <div>
                <span>الخدمة القادمة</span>
                <b>
                  {latestHistory?.nextServiceKm
                    ? `${latestHistory.nextServiceKm.toLocaleString("ar-SA")} كم`
                    : latestHistory?.nextServiceAt
                      ? latestHistory.nextServiceAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })
                      : "غير محددة"}
                </b>
              </div>
            </div>
          </article>
        ))}
        {vehicleSummaries.length === 0 && <article className="panel empty">لا توجد سيارات مرتبطة بهذا العميل.</article>}
      </section>

      <article className="panel">
        <h2>تاريخ الخدمات والفواتير</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>أمر الخدمة</th>
                <th>اللوحة</th>
                <th>العداد</th>
                <th>الخدمات والمواد</th>
                <th>الحالة</th>
                <th>الفاتورة</th>
                <th>الإجمالي</th>
                <th>المحصل</th>
              </tr>
            </thead>
            <tbody>
              {customer.serviceOrders.map((order) => {
                const paid = order.invoice?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
                return (
                  <tr key={order.id}>
                    <td>{order.createdAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                    <td><a className="orderLink" href={`/dashboard/service-orders/${order.id}`}>{order.orderNo}</a></td>
                    <td>{order.vehicle.plate}</td>
                    <td>{order.odometer?.toLocaleString("ar-SA") ?? "—"}</td>
                    <td>
                      <div className="serviceTags">
                        {order.items.slice(0, 4).map((item) => <span key={item.id}>{item.descriptionAr}</span>)}
                        {order.items.length > 4 && <small>+{order.items.length - 4}</small>}
                      </div>
                    </td>
                    <td><span className="statusBadge">{statusLabels[order.status]}</span></td>
                    <td>
                      {order.invoice
                        ? <a className="orderLink" href={`/dashboard/invoices/${order.invoice.id}`}>{order.invoice.invoiceNo}</a>
                        : "—"}
                    </td>
                    <td>{order.invoice ? money(Number(order.invoice.total)) : "—"}</td>
                    <td>{order.invoice ? money(paid) : "—"}</td>
                  </tr>
                );
              })}
              {customer.serviceOrders.length === 0 && (
                <tr><td colSpan={9} className="empty">لا توجد زيارات مسجلة.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
