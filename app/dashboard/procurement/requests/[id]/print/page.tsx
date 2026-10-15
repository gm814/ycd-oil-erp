import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

export default async function PurchaseRequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;

  const request = await db.purchaseRequest.findFirst({
    where: { id, branchId: session.branchId },
    include: { branch: true, items: { include: { product: true } }, quotes: { include: { supplier: true } } },
  });
  if (!request) notFound();

  const requester = await db.user.findUnique({ where: { id: request.requestedBy }, select: { name: true } });

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/procurement/requests/${request.id}`} className="backLink">← طلب المشتريات</a>
        <PrintDocumentButton label="طباعة طلب المشتريات" />
      </div>
      <article className="ycdDocument">
        <YcdDocumentHeader title="طلب مشتريات" titleEn="PURCHASE REQUEST" number={request.requestNo} />
        <section className="ycdDocMeta">
          <div><span>الفرع</span><b>{request.branch.nameAr}</b></div>
          <div><span>التاريخ</span><b>{request.createdAt.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</b></div>
          <div><span>مقدم الطلب</span><b>{requester?.name ?? request.requestedBy}</b></div>
          <div><span>الحالة</span><b>{request.status}</b></div>
        </section>
        <div className="tableWrap ycdDocTable">
          <table>
            <thead><tr><th>م</th><th>رقم الصنف</th><th>اسم الصنف / الوصف</th><th>الكمية المطلوبة</th><th>الوحدة</th><th>ملاحظات</th></tr></thead>
            <tbody>
              {request.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td><td>{item.product.sku}</td><td>{item.product.nameAr}</td>
                  <td>{Number(item.quantity).toLocaleString("ar-SA-u-nu-latn")}</td><td>{item.product.unit}</td><td>{item.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="ycdReason"><b>سبب الطلب</b><p>{request.reason || "—"}</p></section>
        <section className="ycdApprovals">
          <div><b>مقدم الطلب</b><span>{requester?.name ?? "________________"}</span><small>التوقيع: ________________</small></div>
          <div><b>مدير الفرع</b><span>________________</span><small>التوقيع: ________________</small></div>
          <div><b>المشتريات / الإدارة</b><span>________________</span><small>التوقيع: ________________</small></div>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
