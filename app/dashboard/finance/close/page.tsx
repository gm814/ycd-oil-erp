import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import CloseActions from "./close-actions";

export default async function FinancialClosePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const canPrepare = hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_PREPARE);
  const canReview = hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_REVIEW);
  if (!canPrepare && !canReview && !hasPermission(session.permissions, PERMISSIONS.FINANCE_VIEW)) redirect("/dashboard");

  const closes = await db.financialClose.findMany({
    where: { branchId: session.branchId },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: 36,
  });

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/finance" className="backLink">← المالية والبنوك</a>
          <h1>الإقفال المالي اليومي والشهري</h1>
          <p>إقفال رقابي موحد يربط المبيعات والتحصيلات والمصروفات وفروقات الورديات والمطابقات البنكية.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <CloseActions
        canPrepare={canPrepare}
        canReview={canReview}
        closes={closes.map((item) => ({
          id: item.id,
          closeNo: item.closeNo,
          type: item.type,
          periodStart: item.periodStart.toISOString(),
          periodEnd: item.periodEnd.toISOString(),
          salesTotal: Number(item.salesTotal),
          netFinancialMovement: Number(item.netFinancialMovement),
          openShifts: item.openShifts,
          unresolvedShiftVariances: item.unresolvedShiftVariances,
          unresolvedBankReconciliations: item.unresolvedBankReconciliations,
          status: item.status,
          isOwn: item.preparedBy === session.userId,
        }))}
      />
    </main>
  );
}
