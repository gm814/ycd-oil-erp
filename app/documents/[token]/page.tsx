import { notFound } from "next/navigation";
import { readPackageToken } from "@/lib/customer-package-token";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export const metadata = { title: "مستندات العميل — YCD OIL", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Documents({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readPackageToken(token);
  if (!id) return <main className="workspace" dir="rtl"><h1>انتهت صلاحية الرابط أو أنه غير صالح</h1><p>يرجى طلب رابط جديد لمستنداتك من مركز YCD OIL.</p></main>;
  const invoice = await db.invoice.findFirst({ where: { id, status: { not: "VOID" }, documentType: "INVOICE", serviceOrder: { status: "COMPLETED" } }, select: { invoiceNo: true } });
  if (!invoice) notFound();
  const base = `/api/invoices/${id}/pdf?bundle=1&token=${encodeURIComponent(token)}`;
  return <main className="workspace" dir="rtl" style={{ maxWidth: 760 }}>
    <img src="/brand/ycd-logo-source.svg" alt="YCD OIL" width="180" />
    <h1>مستندات خدمتك — {invoice.invoiceNo}</h1>
    <p>الفاتورة وبطاقة التذكير وكوبون الغسيل الصالح إن وجد، في ملف واحد.</p>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "24px 0" }}>
      <a className="secondaryLink" href={`${base}&format=epson80`}>تنزيل المستندات معًا</a>
      <a className="secondaryLink" href={`${base}&format=epson80&inline=1`} target="_blank" rel="noreferrer">عرض وطباعة — حراري 80 مم</a>
      <a className="secondaryLink" href={`${base}&format=a4&inline=1`} target="_blank" rel="noreferrer">عرض وطباعة — A4</a>
    </div>
    <p>للطباعة: افتح الملف ثم اختر رمز الطابعة. هذا الرابط خاص بمستنداتك وصالح لمدة 7 أيام من تجهيزه.</p>
  </main>;
}
