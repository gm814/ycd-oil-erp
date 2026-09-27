import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

function ageLabel(date: Date) {
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 24) return `${hours} ساعة`;
  return `${Math.floor(hours / 24)} يوم`;
}

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");

  const canProcurement = hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_APPROVE);
  const canSupplierPayment = hasPermission(session.permissions, PERMISSIONS.SUPPLIER_INVOICE_APPROVE_PAYMENT);
  const canExpense = hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_APPROVE);
  const canShiftVariance = hasPermission(session.permissions, PERMISSIONS.SHIFT_VARIANCE_APPROVE);
  const canBankReview = hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE_REVIEW);
  const canCloseReview = hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_REVIEW);
  const canCustody = hasPermission(session.permissions, PERMISSIONS.CUSTODY_APPROVE);
  const canPayroll = hasPermission(session.permissions, PERMISSIONS.PAYROLL_APPROVE);
  const canReports = hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW);
  const canAudit = hasPermission(session.permissions, PERMISSIONS.AUDIT_VIEW);

  if (![canProcurement, canSupplierPayment, canExpense, canShiftVariance, canBankReview, canCloseReview, canCustody, canPayroll, canReports, canAudit].some(Boolean)) {
    redirect("/dashboard");
  }

  const [
    purchaseRequests,
    supplierInvoices,
    expenseRequests,
    shiftVariances,
    bankReconciliations,
    financialCloses,
    custodyRequests,
    payrollPeriods,
    overdueInvoices,
    lowStockProducts,
    maintenanceAssets,
  ] = await Promise.all([
    canProcurement || canReports
      ? db.purchaseRequest.findMany({
          where: { branchId: session.branchId, status: "PENDING_APPROVAL" },
          select: { id: true, requestNo: true, reason: true, requestedBy: true, createdAt: true, _count: { select: { items: true, quotes: true } } },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canSupplierPayment || canReports
      ? db.supplierInvoice.findMany({
          where: { branchId: session.branchId, status: { in: ["MATCHED", "MISMATCH"] } },
          select: { id: true, invoiceNo: true, total: true, status: true, createdAt: true, supplier: { select: { nameAr: true } }, purchaseOrder: { select: { orderNo: true } } },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canExpense || canReports
      ? db.expenseRequest.findMany({
          where: { branchId: session.branchId, status: "REQUESTED" },
          select: { id: true, requestNo: true, descriptionAr: true, amount: true, recipientName: true, requestedBy: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canShiftVariance || canReports
      ? db.shiftVarianceResolution.findMany({
          where: { branchId: session.branchId, status: "PENDING" },
          select: { id: true, shiftId: true, cashVariance: true, cardVariance: true, transferVariance: true, reason: true, requestedBy: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canBankReview || canReports
      ? db.bankReconciliation.findMany({
          where: { branchId: session.branchId, status: { in: ["DRAFT", "REVIEWED"] } },
          select: { id: true, reconciliationNo: true, statementDate: true, difference: true, status: true, preparedBy: true, createdAt: true, account: { select: { nameAr: true } } },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canCloseReview || canReports
      ? db.financialClose.findMany({
          where: { branchId: session.branchId, status: { in: ["DRAFT", "REVIEWED"] } },
          select: { id: true, closeNo: true, type: true, periodStart: true, periodEnd: true, status: true, openShifts: true, unresolvedShiftVariances: true, unresolvedBankReconciliations: true, preparedBy: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canCustody || canReports
      ? db.custodyRequest.findMany({
          where: { branchId: session.branchId, status: "REQUESTED" },
          select: { id: true, custodyNo: true, custodianName: true, purpose: true, requestedAmount: true, requestedBy: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canPayroll || canReports
      ? db.payrollPeriod.findMany({
          where: { branchId: session.branchId, status: "DRAFT" },
          select: { id: true, year: true, month: true, generatedBy: true, createdAt: true, lines: { select: { netSalary: true } } },
          orderBy: [{ year: "asc" }, { month: "asc" }],
          take: 24,
        })
      : Promise.resolve([]),
    canReports
      ? db.invoice.findMany({
          where: {
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
            dueAt: { lt: new Date() },
            serviceOrder: { branchId: session.branchId },
          },
          select: { id: true, invoiceNo: true, total: true, dueAt: true, customer: { select: { name: true } }, payments: { select: { amount: true } } },
          orderBy: { dueAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
    canReports
      ? db.product.findMany({
          where: { active: true, category: { not: "SERVICE" } },
          select: { id: true, sku: true, nameAr: true, minStock: true, stockMovements: { where: { branchId: session.branchId }, select: { quantity: true } } },
          orderBy: { nameAr: "asc" },
        })
      : Promise.resolve([]),
    canReports
      ? db.asset.findMany({
          where: {
            branchId: session.branchId,
            status: { not: "DISPOSED" },
            OR: [{ status: "MAINTENANCE" }, { nextMaintenanceAt: { lte: new Date() } }],
          },
          select: { id: true, assetNo: true, nameAr: true, status: true, nextMaintenanceAt: true },
          orderBy: { nextMaintenanceAt: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const lowStock = lowStockProducts
    .map((product) => ({
      ...product,
      stock: product.stockMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0),
    }))
    .filter((product) => product.stock <= Number(product.minStock))
    .slice(0, 30);

  const pendingApprovalCount =
    purchaseRequests.length + supplierInvoices.length + expenseRequests.length + shiftVariances.length +
    bankReconciliations.length + financialCloses.length + custodyRequests.length + payrollPeriods.length;
  const controlAlertCount = overdueInvoices.length + lowStock.length + maintenanceAssets.length;

  const requesterIds = [...new Set([
    ...purchaseRequests.map((item) => item.requestedBy),
    ...expenseRequests.map((item) => item.requestedBy),
    ...shiftVariances.map((item) => item.requestedBy),
    ...custodyRequests.map((item) => item.requestedBy),
    ...payrollPeriods.map((item) => item.generatedBy),
    ...bankReconciliations.map((item) => item.preparedBy),
    ...financialCloses.map((item) => item.preparedBy),
  ])];
  const users = requesterIds.length
    ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } })
    : [];
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const actor = (id: string) => userName.get(id) ?? "مستخدم النظام";

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>مركز الاعتمادات والتنبيهات الإدارية</h1>
          <p>صندوق عمل موحد لما يحتاج قرارًا أو متابعة قبل أن يتحول إلى تأخير أو فرق مالي وتشغيلي.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>معاملات تنتظر قرارًا</span><b>{pendingApprovalCount.toLocaleString("ar-SA")}</b></article>
        <article><span>تنبيهات رقابية</span><b>{controlAlertCount.toLocaleString("ar-SA")}</b></article>
        <article><span>ذمم متأخرة</span><b>{overdueInvoices.length.toLocaleString("ar-SA")}</b></article>
        <article><span>أصناف منخفضة</span><b>{lowStock.length.toLocaleString("ar-SA")}</b></article>
      </section>

      {(canProcurement || canReports) && (
        <article className="panel inventoryPanel">
          <div className="sectionHeading"><div><h2>طلبات الشراء بانتظار الاعتماد</h2><p>الطلبات الأقدم تظهر أولًا.</p></div><a className="orderLink" href="/dashboard/procurement">فتح المشتريات</a></div>
          <div className="tableWrap"><table><thead><tr><th>الطلب</th><th>السبب</th><th>البنود</th><th>العروض</th><th>طالب الطلب</th><th>العمر</th></tr></thead><tbody>
            {purchaseRequests.map((item) => <tr key={item.id}><td><b>{item.requestNo}</b></td><td>{item.reason || "—"}</td><td>{item._count.items}</td><td>{item._count.quotes}</td><td>{actor(item.requestedBy)}</td><td>{ageLabel(item.createdAt)}</td></tr>)}
            {purchaseRequests.length === 0 && <tr><td colSpan={6} className="empty">لا توجد طلبات شراء معلقة.</td></tr>}
          </tbody></table></div>
        </article>
      )}

      <section className="workGrid">
        {(canExpense || canReports) && (
          <article className="panel">
            <h2>مصروفات تنتظر الاعتماد</h2>
            {expenseRequests.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.requestNo} — {money(Number(item.amount))}</b><span>{item.descriptionAr}</span><span>{item.recipientName || "بدون مستفيد محدد"} · {actor(item.requestedBy)} · {ageLabel(item.createdAt)}</span></div></div>)}
            {expenseRequests.length === 0 && <p className="empty">لا توجد مصروفات بانتظار الاعتماد.</p>}
            <a className="orderLink" href="/dashboard/finance">فتح المالية</a>
          </article>
        )}

        {(canShiftVariance || canReports) && (
          <article className="panel">
            <h2>فروقات ورديات تنتظر القرار</h2>
            {shiftVariances.map((item) => {
              const total = Math.abs(Number(item.cashVariance)) + Math.abs(Number(item.cardVariance)) + Math.abs(Number(item.transferVariance));
              return <div className="paymentCard" key={item.id}><div><b>إجمالي الفروقات {money(total)}</b><span>نقد {money(Number(item.cashVariance))} · مدى {money(Number(item.cardVariance))} · تحويل {money(Number(item.transferVariance))}</span><span>{item.reason || "لا توجد ملاحظة"} · {actor(item.requestedBy)} · {ageLabel(item.createdAt)}</span></div></div>;
            })}
            {shiftVariances.length === 0 && <p className="empty">لا توجد فروقات ورديات معلقة.</p>}
            <a className="orderLink" href="/dashboard/shifts">فتح الورديات</a>
          </article>
        )}
      </section>

      <section className="workGrid">
        {(canBankReview || canReports) && (
          <article className="panel">
            <h2>المطابقات البنكية المفتوحة</h2>
            {bankReconciliations.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.reconciliationNo} — {item.account.nameAr}</b><span>الفرق: {money(Number(item.difference))} · الحالة {item.status === "DRAFT" ? "بانتظار المراجعة" : "مراجعة وتنتظر الإقفال"}</span><span>{actor(item.preparedBy)} · {ageLabel(item.createdAt)}</span></div></div>)}
            {bankReconciliations.length === 0 && <p className="empty">لا توجد مطابقات بنكية مفتوحة.</p>}
            <a className="orderLink" href="/dashboard/finance">فتح المطابقات</a>
          </article>
        )}

        {(canCloseReview || canReports) && (
          <article className="panel">
            <h2>الإقفالات المالية المفتوحة</h2>
            {financialCloses.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.closeNo} — {item.type === "DAILY" ? "يومي" : "شهري"}</b><span>ورديات مفتوحة {item.openShifts} · فروقات ورديات {item.unresolvedShiftVariances} · مطابقات بنك {item.unresolvedBankReconciliations}</span><span>{actor(item.preparedBy)} · {ageLabel(item.createdAt)}</span></div></div>)}
            {financialCloses.length === 0 && <p className="empty">لا توجد إقفالات مالية معلقة.</p>}
            <a className="orderLink" href="/dashboard/finance/closes">فتح الإقفالات</a>
          </article>
        )}
      </section>

      <section className="workGrid">
        {(canCustody || canReports) && (
          <article className="panel">
            <h2>عهد تنتظر الاعتماد</h2>
            {custodyRequests.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.custodyNo} — {money(Number(item.requestedAmount))}</b><span>{item.custodianName} · {item.purpose}</span><span>{actor(item.requestedBy)} · {ageLabel(item.createdAt)}</span></div></div>)}
            {custodyRequests.length === 0 && <p className="empty">لا توجد عهد بانتظار الاعتماد.</p>}
            <a className="orderLink" href="/dashboard/custody">فتح العهد</a>
          </article>
        )}

        {(canPayroll || canReports) && (
          <article className="panel">
            <h2>مسيرات رواتب تنتظر الاعتماد</h2>
            {payrollPeriods.map((item) => {
              const total = item.lines.reduce((sum, line) => sum + Number(line.netSalary), 0);
              return <div className="paymentCard" key={item.id}><div><b>{item.month}/{item.year} — {money(total)}</b><span>{item.lines.length} موظف · أعده {actor(item.generatedBy)} · {ageLabel(item.createdAt)}</span></div></div>;
            })}
            {payrollPeriods.length === 0 && <p className="empty">لا توجد مسيرات رواتب معلقة.</p>}
            <a className="orderLink" href="/dashboard/hr">فتح الرواتب</a>
          </article>
        )}
      </section>

      {(canSupplierPayment || canReports) && (
        <article className="panel inventoryPanel">
          <div className="sectionHeading"><div><h2>فواتير الموردين التي تحتاج متابعة</h2><p>المطابقة الثلاثية قبل اعتماد الدفع.</p></div><a className="orderLink" href="/dashboard/procurement">فتح التوريد</a></div>
          <div className="tableWrap"><table><thead><tr><th>الفاتورة</th><th>المورد</th><th>أمر الشراء</th><th>القيمة</th><th>الحالة</th><th>العمر</th></tr></thead><tbody>
            {supplierInvoices.map((item) => <tr key={item.id}><td><b>{item.invoiceNo}</b></td><td>{item.supplier.nameAr}</td><td>{item.purchaseOrder.orderNo}</td><td>{money(Number(item.total))}</td><td><span className={item.status === "MISMATCH" ? "alertBadge" : "okBadge"}>{item.status === "MISMATCH" ? "غير متطابقة" : "متطابقة وتنتظر الاعتماد"}</span></td><td>{ageLabel(item.createdAt)}</td></tr>)}
            {supplierInvoices.length === 0 && <tr><td colSpan={6} className="empty">لا توجد فواتير موردين تحتاج متابعة.</td></tr>}
          </tbody></table></div>
        </article>
      )}

      {canReports && (
        <>
          <article className="panel inventoryPanel">
            <div className="sectionHeading"><div><h2>ذمم العملاء المتأخرة</h2><p>فواتير تجاوزت تاريخ الاستحقاق ولم تسدد بالكامل.</p></div><a className="orderLink" href="/dashboard/customers">فتح العملاء</a></div>
            <div className="tableWrap"><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>الاستحقاق</th><th>الإجمالي</th><th>المسدد</th><th>المتبقي</th></tr></thead><tbody>
              {overdueInvoices.map((item) => {
                const paid = item.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
                return <tr key={item.id}><td><b>{item.invoiceNo}</b></td><td>{item.customer.name}</td><td>{item.dueAt?.toLocaleDateString("ar-SA")}</td><td>{money(Number(item.total))}</td><td>{money(paid)}</td><td><b>{money(Math.max(0, Number(item.total) - paid))}</b></td></tr>;
              })}
              {overdueInvoices.length === 0 && <tr><td colSpan={6} className="empty">لا توجد ذمم متأخرة.</td></tr>}
            </tbody></table></div>
          </article>

          <section className="workGrid">
            <article className="panel">
              <h2>تنبيه المخزون</h2>
              {lowStock.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.nameAr}</b><span>{item.sku} · المتاح {item.stock.toFixed(3)} · الحد الأدنى {Number(item.minStock).toFixed(3)}</span></div></div>)}
              {lowStock.length === 0 && <p className="empty">لا توجد أصناف عند أو تحت الحد الأدنى.</p>}
              <a className="orderLink" href="/dashboard/inventory">فتح المخزون</a>
            </article>

            <article className="panel">
              <h2>تنبيه الأصول والصيانة</h2>
              {maintenanceAssets.map((item) => <div className="paymentCard" key={item.id}><div><b>{item.assetNo} — {item.nameAr}</b><span>{item.status === "MAINTENANCE" ? "تحت الصيانة" : "موعد صيانة مستحق"}{item.nextMaintenanceAt ? ` · ${item.nextMaintenanceAt.toLocaleDateString("ar-SA")}` : ""}</span></div></div>)}
              {maintenanceAssets.length === 0 && <p className="empty">لا توجد تنبيهات صيانة حالية.</p>}
              <a className="orderLink" href="/dashboard/assets">فتح الأصول</a>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
