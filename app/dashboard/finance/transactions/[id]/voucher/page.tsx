import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { YcdDocumentFooter, YcdDocumentHeader, YcdLegalStrip } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");
  const { id } = await params;

  const transaction = await db.financialTransaction.findFirst({
    where: { id, branchId: session.branchId },
    include: { account: true },
  });
  if (!transaction) notFound();

  const isReceipt = Number(transaction.amount) >= 0;
  const voucherNo = `${isReceipt ? "RV" : "PV"}-${transaction.id.slice(-8).toUpperCase()}`;

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/finance/statement" className="backLink">← كشف الحركة</a>
        <PrintDocumentButton label={isReceipt ? "طباعة سند القبض" : "طباعة سند الصرف"} />
      </div>
      <article className="ycdDocument ycdVoucher">
        <YcdDocumentHeader title={isReceipt ? "سند قبض" : "سند صرف"} titleEn={isReceipt ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER"} number={voucherNo} />
        <YcdLegalStrip />
        <section className="ycdDocMeta">
          <div><span>التاريخ</span><b>{transaction.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</b></div>
          <div><span>الحساب</span><b>{transaction.account.nameAr}</b></div>
          <div><span>المبلغ</span><b>{money(Math.abs(Number(transaction.amount)))}</b></div>
          <div><span>المرجع</span><b>{transaction.reference || "—"}</b></div>
        </section>
        <section className="voucherParty">
          <span>{isReceipt ? "استلمنا من السيد / السيدة" : "يصرف للسيد / السيدة"}</span>
          <b>{transaction.recipientName || "____________________________________________"}</b>
        </section>
        <section className="voucherDescription">
          <span>{isReceipt ? "وذلك عن" : "وذلك مقابل"}</span>
          <b>{transaction.descriptionAr}</b>
        </section>
        <section className="voucherDetails">
          <div><span>طريقة الحركة</span><b>{transaction.account.type === "CASH" ? "نقدًا" : transaction.account.type === "BANK" ? "بنك / تحويل" : "مدى / شبكة"}</b></div>
          <div><span>رقم الجوال</span><b>{transaction.recipientPhone || "—"}</b></div>
          <div><span>نوع القيد</span><b>{transaction.type}</b></div>
        </section>
        <section className="ycdApprovals">
          <div><b>المدير العام</b><span>________________</span><small>التوقيع: ________________</small></div>
          <div><b>المحاسب</b><span>________________</span><small>التوقيع: ________________</small></div>
          <div><b>{isReceipt ? "المسلم" : "المستلم"}</b><span>{transaction.recipientName || "________________"}</span><small>التوقيع: ________________</small></div>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
