import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import PrintButton from "./print-button";

function money(value: number) {
  return value.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const customer = await db.customer.findFirst({
    where: { id, serviceOrders: { some: { branchId: session.branchId } } },
    include: {
      invoices: {
        where: { status: { not: "VOID" }, serviceOrder: { branchId: session.branchId } },
        include: {
          payments: { orderBy: { paidAt: "asc" } },
          returns: { where: { status: "COMPLETED" }, orderBy: { createdAt: "asc" } },
          serviceOrder: { select: { orderNo: true, vehicle: { select: { plate: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!customer) notFound();

  const entries = customer.invoices.flatMap((invoice) => {
    const rows: Array<{
      date: Date; reference: string; description: string; debit: number; credit: number;
    }> = [{
      date: invoice.createdAt,
      reference: invoice.invoiceNo,
      description: `فاتورة خدمة — ${invoice.serviceOrder.vehicle.plate}`,
      debit: Number(invoice.total),
      credit: 0,
    }];

    for (const payment of invoice.payments) {
      rows.push({
        date: payment.paidAt,
        reference: payment.reference || invoice.invoiceNo,
        description: `تحصيل فاتورة ${invoice.invoiceNo}`,
        debit: 0,
        credit: Number(payment.amount),
      });
    }

    for (const salesReturn of invoice.returns) {
      rows.push({
        date: salesReturn.createdAt,
        reference: salesReturn.returnNo,
        description: `مرتجع / إشعار دائن — ${invoice.invoiceNo}`,
        debit: 0,
        credit: Number(salesReturn.total),
      });
      if (Number(salesReturn.refundAmount) > 0) {
        rows.push({
          date: salesReturn.createdAt,
          reference: salesReturn.refundReference || salesReturn.returnNo,
          description: `رد مبلغ للعميل — ${salesReturn.returnNo}`,
          debit: Number(salesReturn.refundAmount),
          credit: 0,
        });
      }
    }
    return rows;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const statement = entries.map((entry) => {
    running += entry.debit - entry.credit;
    return { ...entry, balance: running };
  });

  const debitTotal = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const creditTotal = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const balance = debitTotal - creditTotal;

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/customers/${customer.id}`} className="backLink">← ملف العميل</a>
        <PrintButton />
      </div>

      <article className="invoiceDocument statementDocument">
        <header className="invoiceHeader">
          <div>
            <div className="logoPlaceholder">YCD <span>OIL</span></div>
            <b>{companyConfig.legalNameAr}</b>
            <p>{companyConfig.branch} · {companyConfig.phone}</p>
            <p>الرقم الضريبي: {companyConfig.vatNumber}</p>
          </div>
          <div className="invoiceTitle">
            <span>كشف حساب عميل</span>
            <h1>{customer.name}</h1>
            <p>{customer.phone || "بدون رقم جوال"}</p>
            <p>حتى {new Date().toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p>
          </div>
        </header>

        <section className="kpis statementKpis">
          <article><span>إجمالي المدين</span><b>{money(debitTotal)}</b></article>
          <article><span>إجمالي الدائن</span><b>{money(creditTotal)}</b></article>
          <article><span>الرصيد الحالي</span><b>{money(balance)}</b></article>
          <article><span>حد الائتمان</span><b>{money(Number(customer.creditLimit))}</b></article>
        </section>

        <div className="tableWrap invoiceTable">
          <table>
            <thead>
              <tr><th>التاريخ</th><th>المرجع</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
            </thead>
            <tbody>
              {statement.map((entry, index) => (
                <tr key={`${entry.reference}-${index}`}>
                  <td>{entry.date.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</td>
                  <td>{entry.reference}</td>
                  <td>{entry.description}</td>
                  <td>{entry.debit ? money(entry.debit) : "—"}</td>
                  <td>{entry.credit ? money(entry.credit) : "—"}</td>
                  <td><b>{money(entry.balance)}</b></td>
                </tr>
              ))}
              {statement.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حركات على حساب العميل.</td></tr>}
            </tbody>
          </table>
        </div>

        <footer className="invoiceFooter">
          <p>كشف الحساب صادر من نظام YCD OIL ERP ويعكس الحركات المسجلة حتى تاريخ الإصدار.</p>
        </footer>
      </article>
    </main>
  );
}
