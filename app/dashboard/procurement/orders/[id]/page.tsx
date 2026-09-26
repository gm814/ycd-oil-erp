import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import OrderProcurementActions from "./order-actions";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { id } = await params;

  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { product: true } },
      receipts: { include: { items: true }, orderBy: { createdAt: "desc" } },
      supplierInvoices: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order || order.branchId !== session.branchId) notFound();

  const receivedByItem = new Map<string, Prisma.Decimal>();
  for (const item of order.receipts.flatMap((receipt) => receipt.items)) {
    receivedByItem.set(item.purchaseOrderItemId, (receivedByItem.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0)).plus(item.quantity));
  }

  const items = order.items.map((item) => ({
    id: item.id,
    label: `${item.product.sku} — ${item.product.nameAr}`,
    ordered: Number(item.quantity),
    received: Number(receivedByItem.get(item.id) ?? 0),
  }));

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/procurement" className="backLink">← المشتريات</a>
          <h1>{order.orderNo}</h1>
          <p>{order.supplier.nameAr} · إجمالي {Number(order.total).toFixed(2)} ر.س</p>
        </div>
        <span className="statusBadge">{order.status}</span>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>الاستلام والمطابقة</h2>
          <OrderProcurementActions
            orderId={order.id}
            status={order.status}
            items={items}
            poSubtotal={Number(order.subtotal)}
            poVatAmount={Number(order.vatAmount)}
            poTotal={Number(order.total)}
            invoices={order.supplierInvoices.map((invoice) => ({
              id: invoice.id,
              invoiceNo: invoice.invoiceNo,
              status: invoice.status,
              matched: invoice.threeWayMatched,
            }))}
          />
        </article>

        <article className="panel">
          <h2>تفاصيل أمر الشراء</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الصنف</th><th>المطلوب</th><th>المستلم</th><th>المتبقي</th><th>تكلفة الوحدة</th></tr></thead>
              <tbody>
                {order.items.map((item) => {
                  const received = Number(receivedByItem.get(item.id) ?? 0);
                  const remaining = Math.max(0, Number(item.quantity) - received);
                  return <tr key={item.id}>
                    <td>{item.product.sku} — {item.product.nameAr}</td>
                    <td>{Number(item.quantity)}</td><td>{received}</td><td>{remaining}</td><td>{Number(item.unitCost).toFixed(2)} ر.س</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          <h3>سندات الاستلام</h3>
          {order.receipts.map((receipt) => (
            <p key={receipt.id} className="receiptLine"><b>{receipt.receiptNo}</b><span>{receipt.createdAt.toLocaleString("ar-SA")}</span></p>
          ))}
          {order.receipts.length === 0 && <p className="empty">لم يتم تسجيل استلام بعد.</p>}

          <h3>فواتير المورد</h3>
          {order.supplierInvoices.map((invoice) => (
            <p key={invoice.id} className="receiptLine">
              <b>{invoice.invoiceNo}</b>
              <span className={invoice.threeWayMatched ? "okBadge" : "alertBadge"}>{invoice.status}</span>
            </p>
          ))}
          {order.supplierInvoices.length === 0 && <p className="empty">لم تسجل فاتورة مورد بعد.</p>}
        </article>
      </section>
    </main>
  );
}
