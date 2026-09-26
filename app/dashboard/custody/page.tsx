import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CustodyRequestForm from "./custody-request-form";

export default async function CustodyPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const [employees, requests] = await Promise.all([
    db.employee.findMany({
      where: { branchId: session.branchId, active: true },
      select: { id: true, code: true, nameAr: true, phone: true },
      orderBy: { nameAr: "asc" },
    }),
    db.custodyRequest.findMany({
      where: { branchId: session.branchId },
      include: { settlements: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>العهد التشغيلية</h1>
          <p>طلب واعتماد وصرف وتسوية وإقفال مع سجل رقابي.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>طلب عهدة جديد</h2>
          <CustodyRequestForm employees={employees} />
        </article>

        <article className="panel">
          <h2>سجل العهد</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الرقم</th><th>المستلم</th><th>الغرض</th><th>المبلغ</th><th>المتبقي</th><th>الحالة</th></tr></thead>
              <tbody>
                {requests.map((request) => {
                  const base = Number(request.approvedAmount ?? request.requestedAmount);
                  const settled = request.settlements.reduce((sum, item) => sum + Number(item.expenseAmount) + Number(item.returnedAmount), 0);
                  return (
                    <tr key={request.id}>
                      <td><a className="orderLink" href={`/dashboard/custody/${request.id}`}>{request.custodyNo}</a></td>
                      <td>{request.custodianName}</td>
                      <td>{request.purpose}</td>
                      <td>{base.toFixed(2)} ر.س</td>
                      <td>{Math.max(0, base - settled).toFixed(2)} ر.س</td>
                      <td><span className="statusBadge">{request.status}</span></td>
                    </tr>
                  );
                })}
                {requests.length === 0 && <tr><td colSpan={6} className="empty">لا توجد عهد تشغيلية بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
