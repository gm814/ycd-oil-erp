import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import ShiftControls from "./shift-controls";
import VarianceAction from "./variance-action";

function money(value: number | null) {
  return value === null ? "—" : value.toFixed(2) + " ر.س";
}

export default async function ShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const canOpen = hasPermission(session.permissions, PERMISSIONS.SHIFT_OPEN);
  const canClose = hasPermission(session.permissions, PERMISSIONS.SHIFT_CLOSE);
  const canVarianceApprove = hasPermission(session.permissions, PERMISSIONS.SHIFT_VARIANCE_APPROVE);
  if (!canOpen && !canClose && !canVarianceApprove) redirect("/dashboard");

  const shifts = await db.shift.findMany({
    where: { branchId: session.branchId },
    include: { varianceResolution: true },
    orderBy: { openedAt: "desc" },
    take: 20,
  });
  const openShift = shifts.find((shift) => !shift.closedAt) ?? null;

  let expected = { cash: 0, card: 0, transfer: 0 };
  if (openShift) {
    const [payments, refunds] = await Promise.all([
      db.payment.findMany({
        where: { shiftId: openShift.id, method: { in: ["CASH", "CARD", "TRANSFER"] } },
        select: { method: true, amount: true },
      }),
      db.salesReturn.findMany({
        where: {
          branchId: session.branchId,
          status: "COMPLETED",
          createdAt: { gte: openShift.openedAt },
          refundMethod: { in: ["CASH", "CARD", "TRANSFER"] },
          refundAmount: { gt: 0 },
        },
        select: { refundMethod: true, refundAmount: true },
      }),
    ]);

    const net = (method: "CASH" | "CARD" | "TRANSFER") => {
      const received = payments
        .filter((payment) => payment.method === method)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const refunded = refunds
        .filter((item) => item.refundMethod === method)
        .reduce((sum, item) => sum + Number(item.refundAmount), 0);
      return received - refunded;
    };

    expected = {
      cash: Number(openShift.openingCash) + net("CASH"),
      card: net("CARD"),
      transfer: net("TRANSFER"),
    };
  }

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>الورديات والإقفال اليومي</h1>
          <p>مطابقة النقدية ومدى/البطاقات والتحويلات البنكية قبل الإقفال النهائي.</p>
        </div>
        <span className={openShift ? "okBadge" : "statusBadge"}>{openShift ? "وردية مفتوحة" : "لا توجد وردية مفتوحة"}</span>
      </div>

      <ShiftControls
        canOpen={canOpen}
        canClose={canClose}
        openShift={openShift ? {
          id: openShift.id,
          openedAt: openShift.openedAt.toISOString(),
          openingCash: Number(openShift.openingCash),
          expectedCash: expected.cash,
          expectedCard: expected.card,
          expectedTransfer: expected.transfer,
        } : null}
      />

      <article className="panel inventoryPanel">
        <h2>سجل الورديات والتسويات</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>الفتح</th><th>الإقفال</th>
                <th>النقد المتوقع</th><th>النقد الفعلي</th><th>فرق النقد</th>
                <th>مدى المتوقع</th><th>مدى الفعلي</th><th>فرق مدى</th>
                <th>التحويل المتوقع</th><th>التحويل الفعلي</th><th>فرق التحويل</th><th>حالة الفرق</th><th>التقرير</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{shift.openedAt.toLocaleString("ar-SA")}</td>
                  <td>{shift.closedAt?.toLocaleString("ar-SA") ?? "مفتوحة"}</td>
                  <td>{money(shift.expectedCash === null ? null : Number(shift.expectedCash))}</td>
                  <td>{money(shift.countedCash === null ? null : Number(shift.countedCash))}</td>
                  <td>{money(shift.cashVariance === null ? null : Number(shift.cashVariance))}</td>
                  <td>{money(shift.expectedCard === null ? null : Number(shift.expectedCard))}</td>
                  <td>{money(shift.countedCard === null ? null : Number(shift.countedCard))}</td>
                  <td>{money(shift.cardVariance === null ? null : Number(shift.cardVariance))}</td>
                  <td>{money(shift.expectedTransfer === null ? null : Number(shift.expectedTransfer))}</td>
                  <td>{money(shift.countedTransfer === null ? null : Number(shift.countedTransfer))}</td>
                  <td>{money(shift.transferVariance === null ? null : Number(shift.transferVariance))}</td>
                  <td>
                    {!shift.varianceResolution ? (
                      <span className="okBadge">لا يوجد فرق يتطلب اعتمادًا</span>
                    ) : shift.varianceResolution.status === "APPROVED" ? (
                      <span className="okBadge">الفرق معتمد</span>
                    ) : shift.varianceResolution.status === "REJECTED" ? (
                      <span className="alertBadge">الفرق مرفوض</span>
                    ) : canVarianceApprove ? (
                      <VarianceAction shiftId={shift.id} ownRequest={shift.varianceResolution.requestedBy === session.userId} />
                    ) : (
                      <span className="alertBadge">بانتظار اعتماد الفرق</span>
                    )}
                  </td>
                  <td><a className="orderLink" href={`/dashboard/shifts/${shift.id}`}>عرض / طباعة</a></td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={13} className="empty">لا توجد ورديات مسجلة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
