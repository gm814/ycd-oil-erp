import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader, YcdLegalStrip } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

function money(value: number) { return value.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س"; }

export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;
  const order = await db.purchaseOrder.findFirst({
    where: { id, branchId: session.branchId },
    include: { branch: true, supplier: true, items: { include: { product: true } }, purchaseRequest: true },
  });
  if (!order) notFound();
  const creator = await db.user.findUnique({ where: { id: order.createdBy }, select: { name: true } });

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/procurement/orders/${order.id}`} className="backLink">← أمر الشراء</a>
        <PrintDocumentButton label="طباعة أمر الشراء" />
      </div>
      <article className="ycdDocument">
        <YcdDocumentHeader title="أمر شراء" titleEn="PURCHASE ORDER" number={order.orderNo} />
        <YcdLegalStrip />
        <section className="ycdDocMeta">
          <div><span>الفرع</span><b>{order.branch.nameAr}</b></div>
          <div><span>التاريخ</span><b>{order.createdAt.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</b></div>
          <div><span>المورد</span><b>{order.supplier.nameAr}</b></div>
          <div><span>طلب الشراء</span><b>{order.purchaseRequest.requestNo}</b></div>
        </section>
        <div className="tableWrap ycdDocTable"><table>
          <thead><tr><th>م</th><th>رقم الصنف</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead>
          <tbody>{order.items.map((item, index) => <tr key={item.id}>
            <td>{index + 1}</td><td>{item.product.sku}</td><td>{item.product.nameAr}</td><td>{Number(item.quantity)}</td>
            <td>{item.product.unit}</td><td>{money(Number(item.unitCost))}</td><td>{money(Number(item.unitCost) * Number(item.quantity))}</td>
          </tr>)}</tbody>
        </table></div>
        <section className="invoiceTotals ycdOrderTotals">
          <div><span>الإجمالي قبل الضريبة</span><b>{money(Number(order.subtotal))}</b></div>
          <div><span>ضريبة القيمة المضافة</span><b>{money(Number(order.vatAmount))}</b></div>
          <div className="grandTotal"><span>الإجمالي</span><b>{money(Number(order.total))}</b></div>
        </section>
        <section className="ycdApprovals">
          <div><b>أعد بواسطة</b><span>{creator?.name ?? "________________"}</span><small>التوقيع: ________________</small></div>
          <div><b>المشتريات</b><span>________________</span><small>التوقيع: ________________</small></div>
          <div><b>الاعتماد</b><span>________________</span><small>التوقيع: ________________</small></div>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
