import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

export default async function GoodsReceiptPrintPage({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id, receiptId } = await params;
  const receipt = await db.goodsReceipt.findFirst({
    where: { id: receiptId, purchaseOrderId: id, branchId: session.branchId },
    include: {
      branch: true,
      purchaseOrder: { include: { supplier: true } },
      items: { include: { product: true, purchaseOrderItem: true } },
    },
  });
  if (!receipt) notFound();
  const receiver = await db.user.findUnique({ where: { id: receipt.receivedBy }, select: { name: true } });

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/procurement/orders/${id}`} className="backLink">← أمر الشراء</a>
        <PrintDocumentButton label="طباعة محضر الاستلام" />
      </div>
      <article className="ycdDocument">
        <YcdDocumentHeader title="محضر استلام مواد" titleEn="GOODS RECEIPT NOTE" number={receipt.receiptNo} />
        <section className="ycdDocMeta">
          <div><span>أمر الشراء</span><b>{receipt.purchaseOrder.orderNo}</b></div>
          <div><span>المورد</span><b>{receipt.purchaseOrder.supplier.nameAr}</b></div>
          <div><span>مرجع تسليم المورد</span><b>{receipt.supplierDeliveryRef || "—"}</b></div>
          <div><span>التاريخ</span><b>{receipt.createdAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</b></div>
        </section>
        <div className="tableWrap ycdDocTable"><table>
          <thead><tr><th>م</th><th>رقم الصنف</th><th>الصنف</th><th>الكمية المستلمة</th><th>الوحدة</th><th>الكمية بأمر الشراء</th></tr></thead>
          <tbody>{receipt.items.map((item, index) => <tr key={item.id}>
            <td>{index + 1}</td><td>{item.product.sku}</td><td>{item.product.nameAr}</td><td>{Number(item.quantity)}</td>
            <td>{item.product.unit}</td><td>{Number(item.purchaseOrderItem.quantity)}</td>
          </tr>)}</tbody>
        </table></div>
        <section className="ycdReason"><b>إقرار الاستلام</b><p>تم استلام الكميات الموضحة أعلاه وإثباتها في مخزون الفرع وربطها بأمر الشراء المشار إليه.</p></section>
        <section className="ycdApprovals">
          <div><b>المستلم</b><span>{receiver?.name ?? "________________"}</span><small>التوقيع: ________________</small></div>
          <div><b>المستودع</b><span>________________</span><small>التوقيع: ________________</small></div>
          <div><b>المشتريات / الإدارة</b><span>________________</span><small>التوقيع: ________________</small></div>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
