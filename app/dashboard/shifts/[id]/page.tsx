import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import PrintButton from "./print-button";

function money(value: number) {
  return value.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

const paymentLabel: Record<string, string> = {
  CASH: "نقدي",
  CARD: "مدى / بطاقة",
  TRANSFER: "تحويل بنكي",
};

export default async function ShiftClosingReport({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (
    !hasPermission(session.permissions, PERMISSIONS.SHIFT_CLOSE) &&
    !hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)
  ) redirect("/dashboard");

  const { id } = await params;
  const shift = await db.shift.findFirst({
    where: { id, branchId: session.branchId },
    include: {
      payments: {
        where: { method: { in: ["CASH", "CARD", "TRANSFER"] } },
        include: { invoice: { select: { invoiceNo: true } } },
        orderBy: { paidAt: "asc" },
      },
      serviceOrders: {
        select: { id: true, orderNo: true, status: true },
      },
      varianceResolution: true,
    },
  });
  if (!shift) notFound();

  const end = shift.closedAt ?? new Date();
  const refunds = await db.salesReturn.findMany({
    where: {
      branchId: session.branchId,
      status: "COMPLETED",
      createdAt: { gte: shift.openedAt, lte: end },
      refundMethod: { in: ["CASH", "CARD", "TRANSFER"] },
      refundAmount: { gt: 0 },
    },
    select: { returnNo: true, refundMethod: true, refundAmount: true, refundReference: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const received = (method: "CASH" | "CARD" | "TRANSFER") =>
    shift.payments.filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const refunded = (method: "CASH" | "CARD" | "TRANSFER") =>
    refunds.filter((item) => item.refundMethod === method)
      .reduce((sum, item) => sum + Number(item.refundAmount), 0);

  const channels = [
    {
      label: "النقد",
      expected: shift.expectedCash === null ? Number(shift.openingCash) + received("CASH") - refunded("CASH") : Number(shift.expectedCash),
      actual: shift.countedCash === null ? null : Number(shift.countedCash),
      variance: shift.cashVariance === null ? null : Number(shift.cashVariance),
    },
    {
      label: "مدى / البطاقات",
      expected: shift.expectedCard === null ? received("CARD") - refunded("CARD") : Number(shift.expectedCard),
      actual: shift.countedCard === null ? null : Number(shift.countedCard),
      variance: shift.cardVariance === null ? null : Number(shift.cardVariance),
    },
    {
      label: "التحويل البنكي",
      expected: shift.expectedTransfer === null ? received("TRANSFER") - refunded("TRANSFER") : Number(shift.expectedTransfer),
      actual: shift.countedTransfer === null ? null : Number(shift.countedTransfer),
      variance: shift.transferVariance === null ? null : Number(shift.transferVariance),
    },
  ];

  const totalReceipts = shift.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const totalRefunds = refunds.reduce((sum, item) => sum + Number(item.refundAmount), 0);
  const completedOrders = shift.serviceOrders.filter((order) => order.status === "COMPLETED").length;

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/shifts" className="backLink">← الورديات والإقفال</a>
        <PrintButton />
      </div>

      <article className="invoiceDocument">
        <header className="invoiceHeader">
          <div>
            <div className="logoPlaceholder">YCD <span>OIL</span></div>
            <b>{companyConfig.legalNameAr}</b>
            <p>{companyConfig.branch} · {companyConfig.phone}</p>
            <p>الرقم الضريبي: {companyConfig.vatNumber}</p>
          </div>
          <div className="invoiceTitle">
            <span>تقرير إقفال وردية</span>
            <h1>{shift.id.slice(0, 8).toUpperCase()}</h1>
            <p>الفتح: {shift.openedAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p>
            <p>الإقفال: {shift.closedAt?.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }) ?? "الوردية ما زالت مفتوحة"}</p>
          </div>
        </header>

        <section className="kpis statementKpis">
          <article><span>رصيد بداية النقد</span><b>{money(Number(shift.openingCash))}</b></article>
          <article><span>التحصيلات</span><b>{money(totalReceipts)}</b></article>
          <article><span>المبالغ المستردة</span><b>{money(totalRefunds)}</b></article>
          <article><span>أوامر الخدمة المكتملة</span><b>{completedOrders.toLocaleString("ar-SA-u-nu-latn")}</b></article>
        </section>

        <article className="panel inventoryPanel">
          <h2>مطابقة قنوات التحصيل</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>القناة</th><th>المتوقع</th><th>الفعلي / المؤكد</th><th>الفرق</th></tr></thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.label}>
                    <td>{channel.label}</td>
                    <td>{money(channel.expected)}</td>
                    <td>{channel.actual === null ? "—" : money(channel.actual)}</td>
                    <td>{channel.variance === null ? "—" : money(channel.variance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel inventoryPanel">
          <h2>حركات التحصيل</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الوقت</th><th>الفاتورة</th><th>الوسيلة</th><th>المرجع</th><th>المبلغ</th></tr></thead>
              <tbody>
                {shift.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paidAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</td>
                    <td>{payment.invoice.invoiceNo}</td>
                    <td>{paymentLabel[payment.method] ?? payment.method}</td>
                    <td>{payment.reference || "—"}</td>
                    <td>{money(Number(payment.amount))}</td>
                  </tr>
                ))}
                {shift.payments.length === 0 && <tr><td colSpan={5} className="empty">لا توجد تحصيلات مرتبطة بهذه الوردية.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        {refunds.length > 0 && (
          <article className="panel inventoryPanel">
            <h2>المبالغ المستردة خلال الوردية</h2>
            <div className="tableWrap">
              <table>
                <thead><tr><th>الوقت</th><th>المرتجع</th><th>الوسيلة</th><th>المرجع</th><th>المبلغ</th></tr></thead>
                <tbody>
                  {refunds.map((item) => (
                    <tr key={item.returnNo}>
                      <td>{item.createdAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</td>
                      <td>{item.returnNo}</td>
                      <td>{item.refundMethod ? paymentLabel[item.refundMethod] : "—"}</td>
                      <td>{item.refundReference || "—"}</td>
                      <td>{money(Number(item.refundAmount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}

        {shift.varianceResolution && (
          <section className="invoicePolicy">
            <b>حالة اعتماد فروقات الوردية</b>
            <p>الحالة: {shift.varianceResolution.status === "APPROVED" ? "معتمد" : shift.varianceResolution.status === "REJECTED" ? "مرفوض" : "بانتظار الاعتماد"}</p>
            <p>المبرر / الملاحظة: {shift.varianceResolution.decisionNotes || shift.varianceResolution.reason || "لم تسجل ملاحظة."}</p>
          </section>
        )}

        <section className="invoicePolicy">
          <b>ملاحظات الإقفال</b>
          <p>{shift.notes || "لا توجد ملاحظات مسجلة."}</p>
        </section>

        <footer className="invoiceFooter">
          <p>تقرير رقابي صادر من نظام YCD OIL ERP.</p>
        </footer>
      </article>
    </main>
  );
}
