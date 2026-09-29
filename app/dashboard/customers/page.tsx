import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";

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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) redirect("/dashboard");

  const { q } = await searchParams;
  const query = q?.trim().slice(0, 80) ?? "";
  const branchId = session.branchId;
  const month = riyadhMonthToDateStrings();
  const monthRange = riyadhDateRange(month.from, month.to)!;

  const branchScope: Prisma.CustomerWhereInput = {
    serviceOrders: { some: { branchId } },
  };

  const searchScope: Prisma.CustomerWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
          { vehicles: { some: { plate: { contains: query, mode: "insensitive" } } } },
        ],
      }
    : {};

  const [customers, customerCount, vehicleCount, monthInvoices, recentInvoices] = await Promise.all([
    db.customer.findMany({
      where: { AND: [branchScope, searchScope] },
      include: {
        vehicles: {
          where: { serviceOrders: { some: { branchId } } },
          select: { id: true, plate: true, make: true, model: true, currentOdometer: true },
          orderBy: { plate: "asc" },
        },
        serviceOrders: {
          where: { branchId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            invoice: { select: { total: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.customer.count({ where: branchScope }),
    db.vehicle.count({ where: { serviceOrders: { some: { branchId } } } }),
    db.invoice.findMany({
      where: {
        createdAt: { gte: monthRange.start, lt: monthRange.end },
        status: { not: "VOID" },
        serviceOrder: { branchId },
      },
      select: { total: true },
    }),
    db.invoice.findMany({
      where: { status: { not: "VOID" }, serviceOrder: { branchId } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        serviceOrder: { select: { orderNo: true, vehicle: { select: { plate: true } } } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const monthSales = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const totalCustomerSales = (customer: (typeof customers)[number]) =>
    customer.serviceOrders.reduce((sum, order) => sum + Number(order.invoice?.total ?? 0), 0);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المبيعات والعملاء</h1>
          <p>ملف موحد للعميل والسيارة والفواتير وتاريخ أوامر الخدمة.</p>
          <p><a className="orderLink" href="/dashboard/receivables">فتح الذمم المدينة والتحصيل ←</a></p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="kpis">
        <article><span>العملاء المسجلون</span><b>{customerCount.toLocaleString("ar-SA")}</b></article>
        <article><span>السيارات المسجلة</span><b>{vehicleCount.toLocaleString("ar-SA")}</b></article>
        <article><span>مبيعات الشهر حتى اليوم</span><b>{money(monthSales)}</b></article>
        <article><span>فواتير الشهر</span><b>{monthInvoices.length.toLocaleString("ar-SA")}</b></article>
      </section>

      <article className="panel customerSearch">
        <form method="get" className="customerSearchForm">
          <label>
            البحث باسم العميل أو الجوال أو لوحة السيارة
            <input name="q" defaultValue={query} placeholder="مثال: 05... أو رقم اللوحة" />
          </label>
          <button type="submit">بحث</button>
          {query && <a className="secondaryLink" href="/dashboard/customers">مسح البحث</a>}
        </form>
      </article>

      <section className="workGrid customerGrid">
        <article className="panel">
          <h2>سجل العملاء</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>الجوال</th>
                  <th>السيارات</th>
                  <th>الزيارات</th>
                  <th>إجمالي المبيعات</th>
                  <th>آخر حالة</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><a className="orderLink" href={`/dashboard/customers/${customer.id}`}>{customer.name}</a></td>
                    <td>{customer.phone || "—"}</td>
                    <td>
                      <div className="plateStack">
                        {customer.vehicles.slice(0, 3).map((vehicle) => <span key={vehicle.id}>{vehicle.plate}</span>)}
                        {customer.vehicles.length > 3 && <small>+{customer.vehicles.length - 3}</small>}
                      </div>
                    </td>
                    <td>{customer.serviceOrders.length.toLocaleString("ar-SA")}</td>
                    <td>{money(totalCustomerSales(customer))}</td>
                    <td>{customer.serviceOrders[0] ? statusLabels[customer.serviceOrders[0].status] : "—"}</td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={6} className="empty">لا توجد نتائج مطابقة.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>آخر الفواتير</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>الفاتورة</th>
                  <th>العميل</th>
                  <th>اللوحة</th>
                  <th>الإجمالي</th>
                  <th>المحصل</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((invoice) => {
                  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
                  return (
                    <tr key={invoice.id}>
                      <td><a className="orderLink" href={`/dashboard/invoices/${invoice.id}`}>{invoice.invoiceNo}</a></td>
                      <td><a href={`/dashboard/customers/${invoice.customer.id}`}>{invoice.customer.name}</a></td>
                      <td>{invoice.serviceOrder.vehicle.plate}</td>
                      <td>{money(Number(invoice.total))}</td>
                      <td>{money(paid)}</td>
                    </tr>
                  );
                })}
                {recentInvoices.length === 0 && (
                  <tr><td colSpan={5} className="empty">لا توجد فواتير مسجلة بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
