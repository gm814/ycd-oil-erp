import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

function daysPastDue(dueAt: Date | null) {
  if (!dueAt) return 0;
  const diff = Date.now() - dueAt.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export default async function ReceivablesPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) redirect("/dashboard");

  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      serviceOrder: { branchId: session.branchId },
    },
    include: {
      customer: true,
      payments: { select: { amount: true } },
      returns: { where: { status: "COMPLETED" }, select: { total: true, refundAmount: true } },
      serviceOrder: { select: { orderNo: true, vehicle: { select: { plate: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  const rows = invoices.map((invoice) => {
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const returned = invoice.returns.reduce((sum, item) => sum + Number(item.total), 0);
    const refunded = invoice.returns.reduce((sum, item) => sum + Number(item.refundAmount), 0);
    const outstanding = Math.max(Number(invoice.total) - returned - (paid - refunded), 0);
    const lateDays = daysPastDue(invoice.dueAt);
    return { invoice, paid, outstanding, lateDays };
  }).filter((row) => row.outstanding > 0);

  const total = rows.reduce((sum, row) => sum + row.outstanding, 0);
  const overdue = rows.filter((row) => row.lateDays > 0).reduce((sum, row) => sum + row.outstanding, 0);
  const dueSoon = rows.filter((row) => row.lateDays === 0).reduce((sum, row) => sum + row.outstanding, 0);
  const customers = new Set(rows.map((row) => row.invoice.customerId)).size;

  const aging = [
    { label: "غير متأخر", amount: rows.filter((row) => row.lateDays === 0).reduce((s, r) => s + r.outstanding, 0) },
    { label: "1–30 يوم", amount: rows.filter((row) => row.lateDays >= 1 && row.lateDays <= 30).reduce((s, r) => s + r.outstanding, 0) },
    { label: "31–60 يوم", amount: rows.filter((row) => row.lateDays >= 31 && row.lateDays <= 60).reduce((s, r) => s + r.outstanding, 0) },
    { label: "61–90 يوم", amount: rows.filter((row) => row.lateDays >= 61 && row.lateDays <= 90).reduce((s, r) => s + r.outstanding, 0) },
    { label: "أكثر من 90 يوم", amount: rows.filter((row) => row.lateDays > 90).reduce((s, r) => s + r.outstanding, 0) },
  ];

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/customers" className="backLink">← المبيعات والعملاء</a>
          <h1>الذمم المدينة والتحصيل</h1>
          <p>متابعة الفواتير الآجلة والأرصدة المستحقة وأعمار الديون.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="kpis">
        <article><span>إجمالي الذمم</span><b>{money(total)}</b></article>
        <article><span>المتأخر</span><b>{money(overdue)}</b></article>
        <article><span>غير المتأخر</span><b>{money(dueSoon)}</b></article>
        <article><span>عملاء عليهم رصيد</span><b>{customers.toLocaleString("ar-SA")}</b></article>
      </section>

      <article className="panel">
        <h2>أعمار الذمم</h2>
        <div className="agingGrid">
          {aging.map((bucket) => (
            <div key={bucket.label}>
              <span>{bucket.label}</span>
              <b>{money(bucket.amount)}</b>
            </div>
          ))}
        </div>
      </article>

      <article className="panel inventoryPanel">
        <h2>الفواتير المستحقة</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>العميل</th>
                <th>السيارة</th>
                <th>الإجمالي</th>
                <th>المحصل</th>
                <th>المتبقي</th>
                <th>الاستحقاق</th>
                <th>التأخير</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice, paid, outstanding, lateDays }) => (
                <tr key={invoice.id}>
                  <td><a className="orderLink" href={`/dashboard/invoices/${invoice.id}`}>{invoice.invoiceNo}</a></td>
                  <td><a className="orderLink" href={`/dashboard/customers/${invoice.customerId}`}>{invoice.customer.name}</a></td>
                  <td>{invoice.serviceOrder.vehicle.plate}</td>
                  <td>{money(Number(invoice.total))}</td>
                  <td>{money(paid)}</td>
                  <td><b>{money(outstanding)}</b></td>
                  <td>{invoice.dueAt ? invoice.dueAt.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : "فوري"}</td>
                  <td>{lateDays > 0 ? <span className="alertBadge">{lateDays.toLocaleString("ar-SA")} يوم</span> : <span className="okBadge">ضمن المهلة</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="empty">لا توجد ذمم مدينة مفتوحة.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
