import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import RequestActions from "./request-actions";

export default async function PurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { id } = await params;

  const [request, suppliers] = await Promise.all([
    db.purchaseRequest.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        quotes: { include: { supplier: true, items: true }, orderBy: { totalAmount: "asc" } },
        order: true,
      },
    }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, code: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
  ]);
  if (!request || request.branchId !== session.branchId) notFound();

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/procurement" className="backLink">← المشتريات</a>
          <h1>{request.requestNo}</h1>
          <p>{request.reason || "طلب شراء بدون مبرر إضافي"}</p>
        </div>
        <div className="actionStack">
          <span className="statusBadge">{request.status}</span>
          <a className="secondaryLink" href={`/dashboard/procurement/requests/${request.id}/print`}>طباعة النموذج الرسمي</a>
        </div>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>بنود الطلب</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الصنف</th><th>الكمية</th><th>الوحدة</th></tr></thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id}><td>{item.product.sku} — {item.product.nameAr}</td><td>{Number(item.quantity).toLocaleString("ar-SA-u-nu-latn")}</td><td>{item.product.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <RequestActions
            requestId={request.id}
            status={request.status}
            suppliers={suppliers}
            items={request.items.map((item) => ({ id: item.id, label: `${item.product.sku} — ${item.product.nameAr}`, quantity: Number(item.quantity) }))}
            quotes={request.quotes.map((quote) => ({ id: quote.id, supplier: quote.supplier.nameAr, totalAmount: Number(quote.totalAmount) }))}
            hasOrder={Boolean(request.order)}
          />
        </article>

        <article className="panel">
          <h2>مقارنة عروض الموردين</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>المورد</th><th>رقم العرض</th><th>الإجمالي قبل الضريبة</th><th>الحالة</th></tr></thead>
              <tbody>
                {request.quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>{quote.supplier.nameAr}</td>
                    <td>{quote.quoteNo || "—"}</td>
                    <td>{Number(quote.totalAmount).toFixed(2)} ر.س</td>
                    <td>{quote.selected ? <span className="okBadge">مختار</span> : "—"}</td>
                  </tr>
                ))}
                {request.quotes.length === 0 && <tr><td colSpan={4} className="empty">أضف عرض مورد قبل اعتماد الطلب.</td></tr>}
              </tbody>
            </table>
          </div>
          {request.order && <p className="formNotice">تم إصدار أمر الشراء: <a className="orderLink" href={`/dashboard/procurement/orders/${request.order.id}`}>{request.order.orderNo}</a></p>}
        </article>
      </section>
    </main>
  );
}
