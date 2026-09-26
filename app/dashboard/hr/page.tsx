import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import HrActions from "./hr-actions";

const payrollStatus: Record<string, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  PAID: "مدفوع",
  CANCELLED: "ملغى",
};

const attendanceStatus: Record<string, string> = {
  PRESENT: "حاضر",
  ABSENT: "غائب",
  LEAVE: "إجازة",
  SICK: "مرضي",
  OFF: "راحة",
};

export default async function HrPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const [employees, attendance, payrolls] = await Promise.all([
    db.employee.findMany({ where: { branchId: session.branchId }, orderBy: { code: "asc" } }),
    db.attendanceRecord.findMany({
      where: { employee: { branchId: session.branchId } },
      include: { employee: true },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    db.payrollPeriod.findMany({
      where: { branchId: session.branchId },
      include: { lines: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    }),
  ]);

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>الموظفون والرواتب</h1>
          <p>ملفات الموظفين، الحضور، الاستحقاقات والخصومات، ومسير الرواتب الشهري.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <HrActions employees={employees.map((employee) => ({
        id: employee.id,
        code: employee.code,
        nameAr: employee.nameAr,
      }))} />

      <section className="workGrid">
        <article className="panel">
          <h2>الموظفون</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الكود</th><th>الموظف</th><th>الوظيفة</th><th>الراتب الأساسي</th><th>البدلات</th><th>الحالة</th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.code}</td><td>{employee.nameAr}</td><td>{employee.jobTitleAr || "—"}</td>
                    <td>{Number(employee.baseSalary).toFixed(2)} ر.س</td>
                    <td>{(Number(employee.housingAllowance) + Number(employee.transportAllowance)).toFixed(2)} ر.س</td>
                    <td>{employee.active ? "نشط" : "موقوف"}</td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={6} className="empty">لا توجد ملفات موظفين بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>آخر سجلات الحضور</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>التاريخ</th><th>الموظف</th><th>الحالة</th><th>تأخير</th><th>إضافي</th></tr></thead>
              <tbody>
                {attendance.map((item) => (
                  <tr key={item.id}>
                    <td>{item.workDate.toLocaleDateString("ar-SA")}</td><td>{item.employee.nameAr}</td>
                    <td>{attendanceStatus[item.status] ?? item.status}</td><td>{item.lateMin} دقيقة</td><td>{item.overtimeMin} دقيقة</td>
                  </tr>
                ))}
                {attendance.length === 0 && <tr><td colSpan={5} className="empty">لا توجد سجلات حضور بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <article className="panel inventoryPanel">
        <h2>مسيرات الرواتب</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>الفترة</th><th>الموظفون</th><th>إجمالي الصافي</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {payrolls.map((period) => (
                <tr key={period.id}>
                  <td>{period.month}/{period.year}</td>
                  <td>{period.lines.length}</td>
                  <td>{period.lines.reduce((sum, line) => sum + Number(line.netSalary), 0).toFixed(2)} ر.س</td>
                  <td><span className="statusBadge">{payrollStatus[period.status] ?? period.status}</span></td>
                  <td><a className="orderLink" href={`/dashboard/hr/payroll/${period.id}`}>فتح المسير</a></td>
                </tr>
              ))}
              {payrolls.length === 0 && <tr><td colSpan={5} className="empty">لم يتم إنشاء مسير رواتب بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
