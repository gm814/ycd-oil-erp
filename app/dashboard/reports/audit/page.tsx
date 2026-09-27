import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";

const actionLabels: Record<string, string> = {
  VEHICLE_INTAKE_CREATED: "استقبال سيارة",
  SERVICE_ORDER_OPENED: "فتح أمر خدمة",
  SERVICE_ORDER_COMPLETED: "إقفال أمر خدمة",
  PAYMENT_RECEIVED: "استلام دفعة",
  SALES_RETURN_COMPLETED: "مرتجع / استرداد",
  SHIFT_OPENED: "فتح وردية",
  SHIFT_CLOSED: "إقفال وردية",
  SHIFT_VARIANCE_REQUESTED: "طلب اعتماد فرق وردية",
  SHIFT_VARIANCE_APPROVED: "اعتماد فرق وردية",
  SHIFT_VARIANCE_REJECTED: "رفض فرق وردية",
  FINANCIAL_CLOSE_PREPARED: "إعداد إقفال مالي",
  FINANCIAL_CLOSE_REVIEWED: "مراجعة إقفال مالي",
  FINANCIAL_CLOSE_CLOSED: "إقفال مالي نهائي",
  PURCHASE_REQUEST_CREATED: "طلب شراء",
  PURCHASE_REQUEST_APPROVED: "اعتماد طلب شراء",
  SUPPLIER_INVOICE_CREATED: "فاتورة مورد",
  OPERATING_EXPENSE_REQUESTED: "طلب مصروف تشغيلي",
  OPERATING_EXPENSE_APPROVED: "اعتماد مصروف تشغيلي",
  OPERATING_EXPENSE_REJECTED: "رفض مصروف تشغيلي",
  OPERATING_EXPENSE_PAID: "صرف مصروف تشغيلي",
  BANK_RECONCILIATION_PREPARED: "إعداد مطابقة بنكية",
  BANK_RECONCILIATION_REVIEWED: "مراجعة مطابقة بنكية",
  BANK_RECONCILIATION_CLOSED: "إقفال مطابقة بنكية",
  FINANCIAL_TRANSFER_POSTED: "تحويل مالي داخلي",
  POS_SETTLEMENT_POSTED: "تسوية مدى / الشبكة",
  GROUP_FUNDING_RECEIVED: "استلام تمويل من شركات المجموعة",
  CUSTODY_REQUEST_CREATED: "طلب عهدة",
  CUSTODY_CLOSED: "إقفال عهدة",
  PAYROLL_PERIOD_GENERATED: "إنشاء مسير رواتب",
  PAYROLL_APPROVED: "اعتماد مسير رواتب",
  PAYROLL_PAID: "صرف مسير رواتب",
  USER_ACCOUNT_CREATED: "إنشاء حساب مستخدم",
  USER_ACCOUNT_UPDATED: "تحديث حساب مستخدم",
  OPERATIONAL_TEAM_PROVISIONED: "تهيئة حسابات الفريق",
  PREOPENING_CATALOG_IMPORTED: "استيراد الأصناف والجرد",
  PREOPENING_SUPPLIERS_IMPORTED: "استيراد الموردين",
  PREOPENING_EMPLOYEES_IMPORTED: "استيراد بيانات الموظفين",
  UAT_RESULT_RECORDED: "تسجيل نتيجة UAT",
  BRANCH_GO_LIVE: "تفعيل التشغيل التجاري",
};

function safeJson(value: unknown) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value, null, 2);
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; action?: string; actor?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.AUDIT_VIEW)) redirect("/dashboard");

  const params = await searchParams;
  const defaults = riyadhMonthToDateStrings();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const range = riyadhDateRange(from, to) ?? riyadhDateRange(defaults.from, defaults.to)!;
  const effectiveFrom = riyadhDateRange(from, to) ? from : defaults.from;
  const effectiveTo = riyadhDateRange(from, to) ? to : defaults.to;
  const action = (params.action || "").trim();
  const actor = (params.actor || "").trim();
  const q = (params.q || "").trim();

  const branchActorScope = { actor: { branchId: session.branchId } };
  const where = {
    ...branchActorScope,
    createdAt: { gte: range.start, lt: range.end },
    ...(action ? { action } : {}),
    ...(actor ? { actorId: actor } : {}),
    ...(q ? {
      OR: [
        { action: { contains: q, mode: "insensitive" as const } },
        { entityType: { contains: q, mode: "insensitive" as const } },
        { entityId: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [rows, actors, actions, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.user.findMany({
      where: { branchId: session.branchId },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
    db.auditLog.findMany({
      where: branchActorScope,
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
    db.auditLog.count({ where }),
  ]);

  const exportParams = new URLSearchParams({
    from: effectiveFrom,
    to: effectiveTo,
    ...(action ? { action } : {}),
    ...(actor ? { actor } : {}),
    ...(q ? { q } : {}),
  });

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/reports" className="backLink">← التقارير والرقابة</a>
          <h1>سجل التدقيق Audit Trail</h1>
          <p>تتبع العمليات الحساسة ومن نفذها ووقت التنفيذ والقيم قبل وبعد التغيير.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <article className="panel reportFilter">
        <form method="get" className="reportFilterForm">
          <label>من<input type="date" name="from" defaultValue={effectiveFrom} /></label>
          <label>إلى<input type="date" name="to" defaultValue={effectiveTo} /></label>
          <label>العملية
            <select name="action" defaultValue={action}>
              <option value="">جميع العمليات</option>
              {actions.map((item) => <option key={item.action} value={item.action}>{actionLabels[item.action] || item.action}</option>)}
            </select>
          </label>
          <label>المستخدم
            <select name="actor" defaultValue={actor}>
              <option value="">جميع المستخدمين</option>
              {actors.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.username}</option>)}
            </select>
          </label>
          <label>بحث<input name="q" defaultValue={q} placeholder="نوع الكيان / المرجع / العملية" /></label>
          <button type="submit">تطبيق الفلاتر</button>
        </form>
        <div className="actionStack">
          <span>النتائج المطابقة: <b>{total.toLocaleString("ar-SA")}</b></span>
          <a className="secondaryLink" href={`/api/secure/reports/audit.csv?${exportParams.toString()}`}>تصدير CSV</a>
        </div>
      </article>

      <article className="panel inventoryPanel">
        <h2>الحركات الرقابية</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>المرجع</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const before = safeJson(row.beforeJson);
                const after = safeJson(row.afterJson);
                return (
                  <tr key={row.id}>
                    <td>{row.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                    <td><b>{row.actor?.name || "النظام"}</b>{row.actor?.username ? <><br /><small>{row.actor.username}</small></> : null}</td>
                    <td>{actionLabels[row.action] || row.action}<br /><small>{row.action}</small></td>
                    <td>{row.entityType}</td>
                    <td dir="ltr">{row.entityId || "—"}</td>
                    <td>
                      {before || after ? (
                        <details>
                          <summary>عرض قبل / بعد</summary>
                          {before && <><b>قبل</b><pre>{before}</pre></>}
                          {after && <><b>بعد</b><pre>{after}</pre></>}
                        </details>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حركات مطابقة للفلاتر المحددة.</td></tr>}
            </tbody>
          </table>
        </div>
        {total > 500 && <p className="formNotice">يعرض النظام أحدث 500 حركة على الشاشة. استخدم الفلاتر أو تصدير CSV للحصول على نطاق أدق.</p>}
      </article>
    </main>
  );
}
