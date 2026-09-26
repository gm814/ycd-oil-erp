import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import ShiftControls from "./shift-controls";

export default async function ShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const shifts = await db.shift.findMany({
    where: { branchId: session.branchId },
    orderBy: { openedAt: "desc" },
    take: 20,
  });
  const openShift = shifts.find((shift) => !shift.closedAt) ?? null;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>الورديات والإقفال اليومي</h1>
          <p>فتح الوردية، مطابقة النقدية، تسجيل الفروقات، ثم الإقفال.</p>
        </div>
        <span className={openShift ? "okBadge" : "statusBadge"}>{openShift ? "وردية مفتوحة" : "لا توجد وردية مفتوحة"}</span>
      </div>

      <ShiftControls openShift={openShift ? {
        id: openShift.id,
        openedAt: openShift.openedAt.toISOString(),
        openingCash: Number(openShift.openingCash),
      } : null} />

      <article className="panel inventoryPanel">
        <h2>سجل الورديات</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الفتح</th><th>الإقفال</th><th>رصيد البداية</th><th>المتوقع</th><th>المعدود</th><th>الفرق</th></tr></thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{shift.openedAt.toLocaleString("ar-SA")}</td>
                  <td>{shift.closedAt?.toLocaleString("ar-SA") ?? "مفتوحة"}</td>
                  <td>{Number(shift.openingCash).toFixed(2)}</td>
                  <td>{shift.expectedCash ? Number(shift.expectedCash).toFixed(2) : "—"}</td>
                  <td>{shift.countedCash ? Number(shift.countedCash).toFixed(2) : "—"}</td>
                  <td>{shift.cashVariance ? Number(shift.cashVariance).toFixed(2) : "—"}</td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={6} className="empty">لا توجد ورديات مسجلة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
