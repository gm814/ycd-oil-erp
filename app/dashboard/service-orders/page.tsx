import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import IntakeForm from "./intake-form";

export default async function ServiceOrdersPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const channel = (await searchParams).channel === "WASH" ? "WASH" : "OIL";
  const session = await getSession();
  if (!session) redirect("/");
  if (!hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) {
    redirect("/dashboard");
  }

  const orders = session.branchId
    ? await db.serviceOrder.findMany({
        where: { branchId: session.branchId, channel },
        include: { customer: true, vehicle: true },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
    : [];

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>{channel === "WASH" ? "المغسلة — استقبال عميل مباشر" : "استقبال السيارات وأوامر الخدمة"}</h1>
          <p>تسجيل العميل والمركبة وفتح أمر خدمة برقم مرجعي قابل للتتبع.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>استقبال سيارة جديدة</h2>
          <IntakeForm channel={channel} />
        </article>

        <article className="panel">
          <h2>آخر أوامر الخدمة</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الأمر</th>
                  <th>العميل</th>
                  <th>اللوحة</th>
                  <th>العداد</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><a className="orderLink" href={`/dashboard/service-orders/${order.id}`}>{order.orderNo}</a></td>
                    <td>{order.customer.name}</td>
                    <td>{order.vehicle.plate}</td>
                    <td>{order.odometer?.toLocaleString("ar-SA") ?? "—"}</td>
                    <td><span className="statusBadge">{order.status}</span></td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={5} className="empty">لا توجد أوامر خدمة مسجلة بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
