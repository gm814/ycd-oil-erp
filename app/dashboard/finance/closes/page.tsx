import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateKey } from "@/lib/time";
import CloseActions from "./close-actions";

export default async function FinancialClosesPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const canPrepare = hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_PREPARE);
  const canReview = hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_REVIEW);
  const closes = await db.financialClose.findMany({
    where: { branchId: session.branchId },
    orderBy: { periodStart: "desc" },
    take: 36,
  });

  const today = riyadhDateKey(new Date());
  const defaultDay = riyadhDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [year, month] = today.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  const defaultMonth = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/finance" className="backLink">← المالية والبنوك</a>
          <h1>الإقفال المالي اليومي والشهري</h1>
          <p>لقطة رقابية موحدة للمبيعات والتحصيلات والمصروفات والفروقات والمطابقات قبل الإقفال النهائي.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <CloseActions
        canPrepare={canPrepare}
        canReview={canReview}
        defaultDay={defaultDay}
        defaultMonth={defaultMonth}
        rows={closes.map((item) => ({
          id: item.id,
          closeNo: item.closeNo,
          type: item.type,
          periodStart: item.periodStart.toISOString(),
          periodEnd: new Date(item.periodEnd.getTime() - 1).toISOString(),
          status: item.status,
          salesTotal: Number(item.salesTotal),
          netFinancialMovement: Number(item.netFinancialMovement),
          openShifts: item.openShifts,
          unresolvedShiftVariances: item.unresolvedShiftVariances,
          unresolvedBankReconciliations: item.unresolvedBankReconciliations,
          isOwn: item.preparedBy === session.userId,
        }))}
      />
    </main>
  );
}
