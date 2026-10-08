import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CustodyActions from "./custody-actions";

const statusLabel: Record<string, string> = {
  REQUESTED: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  DISBURSED: "مصروفة",
  PARTIALLY_SETTLED: "تسوية جزئية",
  SETTLED: "تمت التسوية",
  CLOSED: "مقفلة",
};

export default async function CustodyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { id } = await params;

  const [custody, accounts] = await Promise.all([
    db.custodyRequest.findUnique({
      where: { id },
      include: { employee: true, sourceAccount: true, settlements: { orderBy: { createdAt: "asc" } } },
    }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId ?? "", active: true, type: { in: ["CASH", "BANK"] } },
      include: { transactions: { select: { amount: true } } },
      orderBy: { nameAr: "asc" },
    }),
  ]);
  if (!custody || custody.branchId !== session.branchId) notFound();

  const approved = Number(custody.approvedAmount ?? 0);
  const expenseTotal = custody.settlements.reduce((sum, item) => sum + Number(item.expenseAmount), 0);
  const returnedTotal = custody.settlements.reduce((sum, item) => sum + Number(item.returnedAmount), 0);
  const remaining = Math.max(0, approved - expenseTotal - returnedTotal);
  const accountRows = accounts.map((account) => ({
    id: account.id,
    nameAr: account.nameAr,
    balance: account.transactions.reduce((sum, item) => sum + Number(item.amount), 0),
  }));

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/custody" className="backLink">← العهد والسلف التشغيلية</a>
          <h1>{custody.custodyNo}</h1>
          <p>{custody.custodianName} · {custody.purpose}</p>
        </div>
        <span className="statusBadge">{statusLabel[custody.status] ?? custody.status}</span>
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>الرقابة والتسوية</h2>
          <div className="shiftSummary">
            <span>المبلغ المطلوب <b>{Number(custody.requestedAmount).toFixed(2)} ر.س</b></span>
            <span>المبلغ المعتمد <b>{approved.toFixed(2)} ر.س</b></span>
            <span>مصروف بمستندات <b>{expenseTotal.toFixed(2)} ر.س</b></span>
            <span>مسترد للصندوق / البنك <b>{returnedTotal.toFixed(2)} ر.س</b></span>
            <span>متبقي للتسوية <b>{remaining.toFixed(2)} ر.س</b></span>
            {custody.sourceAccount && <span>مصدر الصرف <b>{custody.sourceAccount.nameAr}</b></span>}
          </div>
          <CustodyActions
            custodyId={custody.id}
            status={custody.status}
            requestedAmount={Number(custody.requestedAmount)}
            approvedAmount={approved}
            remaining={remaining}
            accounts={accountRows}
          />
        </article>

        <article className="panel">
          <h2>سجل التسويات والأدلة</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>السند</th><th>المصروف</th><th>المسترد</th><th>مرجع المستند</th><th>التاريخ</th></tr></thead>
              <tbody>
                {custody.settlements.map((item) => (
                  <tr key={item.id}>
                    <td>{item.settlementNo}</td>
                    <td>{Number(item.expenseAmount).toFixed(2)} ر.س</td>
                    <td>{Number(item.returnedAmount).toFixed(2)} ر.س</td>
                    <td>{item.documentReference || "—"}</td>
                    <td>{item.createdAt.toLocaleString("ar-SA-u-nu-latn")}</td>
                  </tr>
                ))}
                {custody.settlements.length === 0 && <tr><td colSpan={5} className="empty">لا توجد تسويات بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
