import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import PayrollActions from "./payroll-actions";

const statusLabel: Record<string, string> = { DRAFT: "مسودة", APPROVED: "معتمد", PAID: "مدفوع", CANCELLED: "ملغى" };

export default async function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { id } = await params;

  const [period, accounts] = await Promise.all([
    db.payrollPeriod.findUnique({
      where: { id },
      include: { lines: { include: { employee: true }, orderBy: { employee: { code: "asc" } } } },
    }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId ?? "", active: true, type: { in: ["CASH", "BANK"] } },
      include: { transactions: { select: { amount: true } } },
      orderBy: { nameAr: "asc" },
    }),
  ]);
  if (!period || period.branchId !== session.branchId) notFound();

  const total = period.lines.reduce((sum, line) => sum + Number(line.netSalary), 0);
  const accountRows = accounts.map((account) => ({
    id: account.id,
    nameAr: account.nameAr,
    balance: account.transactions.reduce((sum, item) => sum + Number(item.amount), 0),
  }));

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/hr" className="backLink">← الموظفون والرواتب</a>
          <h1>مسير رواتب {period.month}/{period.year}</h1>
          <p>إجمالي صافي الرواتب: <b>{total.toFixed(2)} ر.س</b></p>
        </div>
        <span className="statusBadge">{statusLabel[period.status] ?? period.status}</span>
      </div>

      <PayrollActions payrollId={period.id} status={period.status} total={total} accounts={accountRows} />

      <article className="panel inventoryPanel">
        <h2>تفاصيل المسير</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الموظف</th><th>الأساسي</th><th>البدلات</th><th>إضافات</th><th>خصومات</th><th>الصافي</th><th>حضور</th><th>غياب</th><th>تأخير</th><th>إضافي</th></tr></thead>
            <tbody>
              {period.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.employee.code} — {line.employee.nameAr}</td>
                  <td>{Number(line.baseSalary).toFixed(2)}</td>
                  <td>{(Number(line.housingAllowance) + Number(line.transportAllowance)).toFixed(2)}</td>
                  <td>{Number(line.otherEarnings).toFixed(2)}</td>
                  <td>{Number(line.deductions).toFixed(2)}</td>
                  <td><b>{Number(line.netSalary).toFixed(2)}</b></td>
                  <td>{line.attendanceDays}</td><td>{line.absentDays}</td><td>{line.lateMin} د</td><td>{line.overtimeMin} د</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
