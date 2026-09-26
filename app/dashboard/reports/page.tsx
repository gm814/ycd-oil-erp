import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateKey, riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";

const paymentLabels: Record<string, string> = {
  CASH: "نقدي",
  CARD: "شبكة / بطاقة",
  TRANSFER: "تحويل",
  CREDIT: "آجل مسجل",
};

const actionLabels: Record<string, string> = {
  VEHICLE_INTAKE_CREATED: "استقبال سيارة",
  SERVICE_ORDER_OPENED: "فتح أمر خدمة",
  SERVICE_ORDER_COMPLETED: "إقفال أمر خدمة",
  PAYMENT_RECEIVED: "استلام دفعة",
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
  CUSTODY_REQUEST_CREATED: "طلب عهدة",
  CUSTODY_CLOSED: "إقفال عهدة",
  EMPLOYEE_CREATED: "إضافة موظف",
  ATTENDANCE_RECORDED: "تسجيل حضور",
  PAYROLL_PERIOD_GENERATED: "إنشاء مسير رواتب",
  PAYROLL_APPROVED: "اعتماد مسير رواتب",
  PAYROLL_PAID: "صرف مسير رواتب",
  ASSET_CREATED: "تسجيل أصل",
  OPERATING_EXPENSE_POSTED: "تسجيل مصروف تشغيلي",
  OPERATING_EXPENSE_REQUESTED: "طلب مصروف تشغيلي",
  OPERATING_EXPENSE_APPROVED: "اعتماد مصروف تشغيلي",
  OPERATING_EXPENSE_REJECTED: "رفض مصروف تشغيلي",
  OPERATING_EXPENSE_PAID: "صرف مصروف تشغيلي",
  BANK_RECONCILIATION_PREPARED: "إعداد مطابقة بنكية",
  BANK_RECONCILIATION_REVIEWED: "مراجعة مطابقة بنكية",
  BANK_RECONCILIATION_CLOSED: "إقفال مطابقة بنكية",
  FINANCIAL_TRANSFER_POSTED: "تحويل مالي داخلي",
  POS_SETTLEMENT_POSTED: "تسوية مدى / الشبكة",
  MAINTENANCE_WORK_ORDER_OPENED: "فتح أمر صيانة",
  MAINTENANCE_COMPLETED: "إقفال أمر صيانة",
};

function money(value: number) {
  return value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const params = await searchParams;
  const defaults = riyadhMonthToDateStrings();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const range = riyadhDateRange(from, to) ?? riyadhDateRange(defaults.from, defaults.to)!;
  const effectiveFrom = riyadhDateRange(from, to) ? from : defaults.from;
  const effectiveTo = riyadhDateRange(from, to) ? to : defaults.to;

  const [
    invoices,
    periodPayments,
    serviceOrders,
    shifts,
    financialTransactions,
    products,
    pendingPurchases,
    invoiceMismatches,
    openCustodies,
    pendingPayrolls,
    maintenanceAlerts,
    recentAudits,
    accounts,
  ] = await Promise.all([
    db.invoice.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        status: { not: "VOID" },
        serviceOrder: { branchId: session.branchId },
      },
      include: { payments: true },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.findMany({
      where: {
        paidAt: { gte: range.start, lt: range.end },
        invoice: { serviceOrder: { branchId: session.branchId } },
      },
      select: { method: true, amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    }),
    db.serviceOrder.findMany({
      where: { branchId: session.branchId, createdAt: { gte: range.start, lt: range.end } },
      select: { id: true, status: true, createdAt: true },
    }),
    db.shift.findMany({
      where: { branchId: session.branchId, openedAt: { gte: range.start, lt: range.end } },
      select: { id: true, openedAt: true, closedAt: true, expectedCash: true, countedCash: true, cashVariance: true, expectedCard: true, countedCard: true, cardVariance: true, expectedTransfer: true, countedTransfer: true, transferVariance: true },
      orderBy: { openedAt: "desc" },
    }),
    db.financialTransaction.findMany({
      where: { branchId: session.branchId, createdAt: { gte: range.start, lt: range.end } },
      select: { amount: true, type: true, createdAt: true },
    }),
    db.product.findMany({
      where: { active: true },
      select: {
        nameAr: true,
        costPrice: true,
        minStock: true,
        stockMovements: {
          where: { branchId: session.branchId },
          select: { quantity: true },
        },
      },
      orderBy: { nameAr: "asc" },
    }),
    db.purchaseRequest.count({
      where: { branchId: session.branchId, status: "PENDING_APPROVAL" },
    }),
    db.supplierInvoice.count({
      where: { branchId: session.branchId, status: "MISMATCH" },
    }),
    db.custodyRequest.count({
      where: {
        branchId: session.branchId,
        status: { in: ["REQUESTED", "APPROVED", "DISBURSED", "PARTIALLY_SETTLED", "SETTLED"] },
      },
    }),
    db.payrollPeriod.count({
      where: { branchId: session.branchId, status: { in: ["DRAFT", "APPROVED"] } },
    }),
    db.asset.count({
      where: {
        branchId: session.branchId,
        status: { not: "DISPOSED" },
        OR: [{ status: "MAINTENANCE" }, { nextMaintenanceAt: { lte: new Date() } }],
      },
    }),
    db.auditLog.findMany({
      where: { actor: { branchId: session.branchId } },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.financialAccount.findMany({
      where: { branchId: session.branchId, active: true },
      include: { transactions: { select: { amount: true } } },
      orderBy: { nameAr: "asc" },
    }),
  ]);

  const sales = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.vatAmount), 0);
  const collections = periodPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const averageInvoice = invoices.length ? sales / invoices.length : 0;
  const completedOrders = serviceOrders.filter((order) => order.status === "COMPLETED").length;

  const paymentTotals = new Map<string, number>();
  for (const payment of periodPayments) {
    paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + Number(payment.amount));
  }

  const dailySales = new Map<string, { sales: number; invoices: number }>();
  for (const invoice of invoices) {
    const key = riyadhDateKey(invoice.createdAt);
    const row = dailySales.get(key) ?? { sales: 0, invoices: 0 };
    row.sales += Number(invoice.total);
    row.invoices += 1;
    dailySales.set(key, row);
  }
  const salesRows = [...dailySales.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxDailySales = Math.max(...salesRows.map(([, row]) => row.sales), 1);

  const lowStock = products.map((product) => {
    const quantity = product.stockMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    return { nameAr: product.nameAr, quantity, minStock: Number(product.minStock), costPrice: Number(product.costPrice) };
  }).filter((product) => product.quantity <= product.minStock);

  const inventoryValue = products.reduce((sum, product) => {
    const quantity = product.stockMovements.reduce((qty, movement) => qty + Number(movement.quantity), 0);
    return sum + Math.max(quantity, 0) * Number(product.costPrice);
  }, 0);

  const cashVariance = shifts.reduce((sum, shift) => sum + Math.abs(Number(shift.cashVariance ?? 0)), 0);
  const cardVariance = shifts.reduce((sum, shift) => sum + Math.abs(Number(shift.cardVariance ?? 0)), 0);
  const transferVariance = shifts.reduce((sum, shift) => sum + Math.abs(Number(shift.transferVariance ?? 0)), 0);
  const totalReconciliationVariance = cashVariance + cardVariance + transferVariance;
  const varianceShifts = shifts.filter((shift) =>
    Number(shift.cashVariance ?? 0) !== 0 ||
    Number(shift.cardVariance ?? 0) !== 0 ||
    Number(shift.transferVariance ?? 0) !== 0
  ).length;
  const openShifts = shifts.filter((shift) => !shift.closedAt).length;

  const financialIn = financialTransactions.filter((item) => Number(item.amount) > 0)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const financialOut = financialTransactions.filter((item) => Number(item.amount) < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);

  const accountRows = accounts.map((account) => ({
    id: account.id,
    nameAr: account.nameAr,
    type: account.type,
    balance: account.transactions.reduce((sum, item) => sum + Number(item.amount), 0),
  }));

  const controlAlerts = [
    ["طلبات شراء تنتظر الاعتماد", pendingPurchases, "/dashboard/procurement"],
    ["فواتير موردين غير متطابقة", invoiceMismatches, "/dashboard/procurement"],
    ["عهد غير مقفلة", openCustodies, "/dashboard/custody"],
    ["مسيرات رواتب تنتظر الإجراء", pendingPayrolls, "/dashboard/hr"],
    ["أصول تحتاج متابعة صيانة", maintenanceAlerts, "/dashboard/assets"],
    ["ورديات بالفترة بها فروقات تسوية", varianceShifts, "/dashboard/shifts"],
  ] as const;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>التقارير والرقابة الإدارية</h1>
          <p>مؤشرات تشغيلية ومالية ورقابية مجمعة للفرع مع تتبع مصادر التنبيه.</p>
        </div>
        <div className="logoPlaceholder">YCD <span>OIL</span></div>
      </div>

      <article className="panel reportFilter">
        <form method="get" className="reportFilterForm">
          <label>من<input type="date" name="from" defaultValue={effectiveFrom} /></label>
          <label>إلى<input type="date" name="to" defaultValue={effectiveTo} /></label>
          <button type="submit">تحديث التقرير</button>
        </form>
        <p>الفترة: <b>{effectiveFrom}</b> إلى <b>{effectiveTo}</b> — توقيت الرياض.</p>
      </article>

      <section className="kpis reportKpis">
        <article><span>إجمالي المبيعات</span><b>{money(sales)}</b></article>
        <article><span>التحصيلات المسجلة</span><b>{money(collections)}</b></article>
        <article><span>عدد الفواتير</span><b>{invoices.length.toLocaleString("ar-SA")}</b></article>
        <article><span>متوسط الفاتورة</span><b>{money(averageInvoice)}</b></article>
        <article><span>السيارات المستلمة</span><b>{serviceOrders.length.toLocaleString("ar-SA")}</b></article>
        <article><span>أوامر مكتملة</span><b>{completedOrders.toLocaleString("ar-SA")}</b></article>
        <article><span>ضريبة القيمة المضافة</span><b>{money(vat)}</b></article>
        <article><span>قيمة المخزون بالتكلفة</span><b>{money(inventoryValue)}</b></article>
      </section>

      <section className="workGrid">
        <article className="panel">
          <h2>المبيعات اليومية</h2>
          <div className="reportBars">
            {salesRows.map(([date, row]) => (
              <div className="reportBarRow" key={date}>
                <span>{date}</span>
                <div className="reportBarTrack"><i style={{ width: `${Math.max((row.sales / maxDailySales) * 100, 2)}%` }} /></div>
                <b>{money(row.sales)}</b>
                <small>{row.invoices} فاتورة</small>
              </div>
            ))}
            {salesRows.length === 0 && <p className="empty">لا توجد مبيعات في الفترة المحددة.</p>}
          </div>
        </article>

        <article className="panel">
          <h2>التحصيل حسب وسيلة الدفع</h2>
          <div className="reportList">
            {["CASH", "CARD", "TRANSFER", "CREDIT"].map((method) => (
              <div key={method}><span>{paymentLabels[method]}</span><b>{money(paymentTotals.get(method) ?? 0)}</b></div>
            ))}
          </div>
          <hr />
          <div className="reportList">
            <div><span>الحركات المالية الداخلة</span><b>{money(financialIn)}</b></div>
            <div><span>الحركات المالية الخارجة</span><b>{money(financialOut)}</b></div>
          </div>
        </article>
      </section>

      <section className="workGrid">
        <article className="panel">
          <h2>مركز التنبيهات الرقابية</h2>
          <div className="reportList">
            {controlAlerts.map(([label, count, href]) => (
              <a className="reportAlert" href={href} key={label}>
                <span>{label}</span>
                <b className={count > 0 ? "alertBadge" : "okBadge"}>{count.toLocaleString("ar-SA")}</b>
              </a>
            ))}
          </div>
          <p>إجمالي فروقات التسوية: <b>{money(totalReconciliationVariance)}</b> · نقد: <b>{money(cashVariance)}</b> · مدى: <b>{money(cardVariance)}</b> · تحويلات: <b>{money(transferVariance)}</b> · ورديات مفتوحة: <b>{openShifts}</b></p>
        </article>

        <article className="panel">
          <h2>أرصدة الحسابات المالية</h2>
          <div className="reportList">
            {accountRows.map((account) => (
              <div key={account.id}>
                <span>{account.nameAr} <small>({account.type})</small></span>
                <b>{money(account.balance)}</b>
              </div>
            ))}
            {accountRows.length === 0 && <p className="empty">لا توجد حسابات مالية فعالة.</p>}
          </div>
        </article>
      </section>

      <article className="panel inventoryPanel">
        <h2>تسويات الورديات حسب قناة التحصيل</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>الوردية</th><th>الحالة</th>
                <th>النقد المتوقع</th><th>النقد الفعلي</th><th>الفرق</th>
                <th>مدى المتوقع</th><th>مدى الفعلي</th><th>الفرق</th>
                <th>التحويل المتوقع</th><th>التحويل الفعلي</th><th>الفرق</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{shift.openedAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                  <td>{shift.closedAt ? <span className="okBadge">مقفلة</span> : <span className="alertBadge">مفتوحة</span>}</td>
                  <td>{money(Number(shift.expectedCash ?? 0))}</td>
                  <td>{shift.countedCash === null ? "—" : money(Number(shift.countedCash))}</td>
                  <td>{shift.cashVariance === null ? "—" : money(Number(shift.cashVariance))}</td>
                  <td>{money(Number(shift.expectedCard ?? 0))}</td>
                  <td>{shift.countedCard === null ? "—" : money(Number(shift.countedCard))}</td>
                  <td>{shift.cardVariance === null ? "—" : money(Number(shift.cardVariance))}</td>
                  <td>{money(Number(shift.expectedTransfer ?? 0))}</td>
                  <td>{shift.countedTransfer === null ? "—" : money(Number(shift.countedTransfer))}</td>
                  <td>{shift.transferVariance === null ? "—" : money(Number(shift.transferVariance))}</td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={11} className="empty">لا توجد ورديات ضمن الفترة المحددة.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <section className="workGrid">
        <article className="panel">
          <h2>مخزون عند أو دون الحد الأدنى</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الصنف</th><th>الرصيد</th><th>الحد الأدنى</th><th>قيمة الرصيد بالتكلفة</th></tr></thead>
              <tbody>
                {lowStock.slice(0, 20).map((product) => (
                  <tr key={product.nameAr}>
                    <td>{product.nameAr}</td>
                    <td>{product.quantity.toFixed(3)}</td>
                    <td>{product.minStock.toFixed(3)}</td>
                    <td>{money(Math.max(product.quantity, 0) * product.costPrice)}</td>
                  </tr>
                ))}
                {lowStock.length === 0 && <tr><td colSpan={4} className="empty">لا توجد أصناف عند الحد الأدنى حاليًا.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>آخر الحركات الرقابية</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>المرجع</th></tr></thead>
              <tbody>
                {recentAudits.map((audit) => (
                  <tr key={audit.id}>
                    <td>{audit.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
                    <td>{audit.actor?.name || "النظام"}</td>
                    <td>{actionLabels[audit.action] || audit.action}</td>
                    <td>{audit.entityType}{audit.entityId ? ` · ${audit.entityId.slice(0, 8)}` : ""}</td>
                  </tr>
                ))}
                {recentAudits.length === 0 && <tr><td colSpan={4} className="empty">لا توجد حركات رقابية مسجلة.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
