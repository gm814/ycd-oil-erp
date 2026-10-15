import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import ProcurementForms from "./procurement-forms";

const requestStatus: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  ORDERED: "تم إصدار أمر شراء",
  CANCELLED: "ملغي",
};

const orderStatus: Record<string, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  PARTIALLY_RECEIVED: "استلام جزئي",
  RECEIVED: "مستلم بالكامل",
  CANCELLED: "ملغي",
};

export default async function ProcurementPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const [products, suppliers, requests, orders, invoices] = await Promise.all([
    db.product.findMany({ where: { active: true }, select: { id: true, sku: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, code: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
    db.purchaseRequest.findMany({
      where: { branchId: session.branchId },
      include: { items: true, quotes: true, order: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.purchaseOrder.findMany({
      where: { branchId: session.branchId },
      include: { supplier: true, receipts: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.supplierInvoice.findMany({
      where: { branchId: session.branchId },
      include: { supplier: true, purchaseOrder: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>المشتريات والتوريد</h1>
          <p>طلب شراء ← عروض موردين ← اعتماد ← أمر شراء ← استلام ← فاتورة مورد ← مطابقة ثلاثية ← اعتماد الدفع.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <ProcurementForms products={products} suppliers={suppliers} />

      <article className="panel inventoryPanel">
        <h2>طلبات الشراء</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الطلب</th><th>البنود</th><th>العروض</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td><a className="orderLink" href={`/dashboard/procurement/requests/${request.id}`}>{request.requestNo}</a></td>
                  <td>{request.items.length}</td>
                  <td>{request.quotes.length}</td>
                  <td><span className="statusBadge">{requestStatus[request.status] ?? request.status}</span></td>
                  <td>{request.createdAt.toLocaleDateString("ar-SA-u-nu-latn")}</td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={5} className="empty">لا توجد طلبات شراء بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <section className="workGrid inventoryPanel">
        <article className="panel">
          <h2>أوامر الشراء</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الأمر</th><th>المورد</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><a className="orderLink" href={`/dashboard/procurement/orders/${order.id}`}>{order.orderNo}</a></td>
                    <td>{order.supplier.nameAr}</td>
                    <td>{Number(order.total).toFixed(2)} ر.س</td>
                    <td><span className="statusBadge">{orderStatus[order.status] ?? order.status}</span></td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={4} className="empty">لا توجد أوامر شراء.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>فواتير الموردين</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الفاتورة</th><th>المورد</th><th>أمر الشراء</th><th>الحالة</th></tr></thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNo}</td>
                    <td>{invoice.supplier.nameAr}</td>
                    <td><a className="orderLink" href={`/dashboard/procurement/orders/${invoice.purchaseOrderId}`}>{invoice.purchaseOrder.orderNo}</a></td>
                    <td><span className={invoice.threeWayMatched ? "okBadge" : "alertBadge"}>{invoice.status}</span></td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={4} className="empty">لا توجد فواتير موردين.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
