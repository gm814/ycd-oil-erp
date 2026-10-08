import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companyConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { riyadhBusinessDayRange } from "@/lib/time";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { DashboardView, type DashboardData } from "./dashboard-view";

const modules = [
  { label: "جاهزية الافتتاح والتشغيل", href: "/dashboard/readiness", any: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.OPERATIONS_UAT, PERMISSIONS.OPERATIONS_GO_LIVE] },
  { label: "مركز الاعتمادات والتنبيهات", href: "/dashboard/approvals", any: [PERMISSIONS.PROCUREMENT_APPROVE, PERMISSIONS.SUPPLIER_INVOICE_APPROVE_PAYMENT, PERMISSIONS.FINANCE_EXPENSE_APPROVE, PERMISSIONS.SHIFT_VARIANCE_APPROVE, PERMISSIONS.BANK_RECONCILE_REVIEW, PERMISSIONS.FINANCIAL_CLOSE_REVIEW, PERMISSIONS.CUSTODY_APPROVE, PERMISSIONS.PAYROLL_APPROVE, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.AUDIT_VIEW] },
  { label: "الورديات والإقفال اليومي", href: "/dashboard/shifts", any: [PERMISSIONS.SHIFT_OPEN, PERMISSIONS.SHIFT_CLOSE, PERMISSIONS.SHIFT_VARIANCE_APPROVE] },
  { label: "استقبال السيارات وأوامر الخدمة", href: "/dashboard/service-orders", any: [PERMISSIONS.SERVICE_ORDER_CREATE, PERMISSIONS.SERVICE_ORDER_APPROVE] },
  { label: "الزيوت وخدمات السيارات", href: "/dashboard/service-orders", any: [PERMISSIONS.SERVICE_ORDER_CREATE, PERMISSIONS.SERVICE_ORDER_APPROVE] },
  { label: "كوبونات المغسلة", href: "/dashboard/coupons", any: [PERMISSIONS.COUPON_REDEEM] },
  { label: "المبيعات والعملاء", href: "/dashboard/customers", any: [PERMISSIONS.CUSTOMER_VIEW, PERMISSIONS.PAYMENT_RECEIVE, PERMISSIONS.INVOICE_ISSUE] },
  { label: "المشتريات والتوريد", href: "/dashboard/procurement", any: [PERMISSIONS.PROCUREMENT_REQUEST, PERMISSIONS.PROCUREMENT_QUOTE, PERMISSIONS.PROCUREMENT_APPROVE, PERMISSIONS.PROCUREMENT_ORDER, PERMISSIONS.PROCUREMENT_RECEIVE] },
  { label: "المخزون والزيوت والفلاتر", href: "/dashboard/inventory", any: [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_ISSUE] },
  { label: "المالية والبنوك", href: "/dashboard/finance", any: [PERMISSIONS.FINANCE_VIEW] },
  { label: "العهد", href: "/dashboard/custody", any: [PERMISSIONS.CUSTODY_REQUEST, PERMISSIONS.CUSTODY_APPROVE, PERMISSIONS.CUSTODY_DISBURSE, PERMISSIONS.CUSTODY_SETTLE, PERMISSIONS.CUSTODY_CLOSE] },
  { label: "الموظفون والرواتب", href: "/dashboard/hr", any: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE, PERMISSIONS.PAYROLL_PREPARE, PERMISSIONS.PAYROLL_APPROVE, PERMISSIONS.PAYROLL_PAY] },
  { label: "الهيكل التشغيلي والمسؤوليات", href: "/dashboard/team", any: [PERMISSIONS.DASHBOARD_VIEW] },
  { label: "الأصول والصيانة", href: "/dashboard/assets", any: [PERMISSIONS.ASSET_VIEW, PERMISSIONS.ASSET_MANAGE, PERMISSIONS.MAINTENANCE_MANAGE] },
  { label: "التقارير والرقابة", href: "/dashboard/reports", any: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.AUDIT_VIEW] },
  { label: "المستندات والنماذج", href: "/dashboard/documents", any: [PERMISSIONS.DASHBOARD_VIEW] },
] as const;

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/");

  const { start, end } = riyadhBusinessDayRange();
  const previousStart = new Date(start.getTime() - 86400000);
  const weekStart = new Date(start.getTime() - 6 * 86400000);

  const [branchState, invoices, serviceOrderCount, openShift, activeCoupons, products, pendingPurchases, invoiceMismatches, openCustodies, draftPayrolls, maintenanceAlerts, pendingShiftVariances, pendingFinancialCloses] = await Promise.all([
    db.branch.findUnique({
      where: { id: session.branchId },
      select: { operationalStatus: true, nameAr: true },
    }),
    db.invoice.findMany({
      where: {
        createdAt: { gte: weekStart, lt: end },
        status: { not: "VOID" },
        serviceOrder: { branchId: session.branchId },
      },
      include: { payments: true, serviceOrder: { include: { items: { include: { product: true } } } } },
    }),
    db.serviceOrder.count({
      where: { branchId: session.branchId, createdAt: { gte: start, lt: end } },
    }),
    db.shift.findFirst({
      where: { branchId: session.branchId, closedAt: null },
      orderBy: { openedAt: "desc" },
    }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        invoice: { serviceOrder: { branchId: session.branchId } },
      },
    }),
    db.product.findMany({
      where: { active: true },
      select: {
        id: true, nameAr: true, minStock: true,
        stockMovements: {
          where: { branchId: session.branchId },
          select: { quantity: true },
        },
      },
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
        OR: [
          { status: "MAINTENANCE" },
          { nextMaintenanceAt: { lte: new Date() } },
        ],
      },
    }),
    db.shiftVarianceResolution.count({
      where: { branchId: session.branchId, status: "PENDING" },
    }),
    db.financialClose.count({
      where: { branchId: session.branchId, status: { in: ["DRAFT", "REVIEWED"] } },
    }),
  ]);

  if (!branchState) redirect("/");
  const phaseLabel = branchState.operationalStatus === "LIVE"
    ? "التشغيل التجاري"
    : branchState.operationalStatus === "SUSPENDED"
      ? "موقوف تشغيليًا"
      : companyConfig.operationalPhaseAr;


  const [transactions, payments, previousCars, recentOrders, requests] = await Promise.all([
    db.financialTransaction.findMany({ where: { branchId: session.branchId, type: "EXPENSE", createdAt: { gte: weekStart, lt: end } }, select: { amount: true, createdAt: true } }),
    db.payment.findMany({ where: { paidAt: { gte: start, lt: end }, invoice: { status: { not: "VOID" }, serviceOrder: { branchId: session.branchId } } }, select: { method: true, amount: true } }),
    db.serviceOrder.count({ where: { branchId: session.branchId, createdAt: { gte: previousStart, lt: start } } }),
    db.serviceOrder.findMany({ where: { branchId: session.branchId, createdAt: { gte: start, lt: end } }, include: { vehicle: true, items: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.purchaseRequest.findMany({ where: { branchId: session.branchId, status: "PENDING_APPROVAL" }, select: { id: true, requestNo: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const total = (from: Date, to: Date) => invoices.filter(i=>i.createdAt>=from && i.createdAt<to).reduce((n,i)=>n+Number(i.total),0);
  const expenses = (from: Date, to: Date) => transactions.filter(t=>t.createdAt>=from && t.createdAt<to).reduce((n,t)=>n+Math.abs(Number(t.amount)),0);
  const categorySales = (category: string, from: Date, to: Date) => invoices.filter(i=>i.createdAt>=from && i.createdAt<to).flatMap(i=>i.serviceOrder.items).filter(i=>i.product?.category===category).reduce((n,i)=>n+Number(i.quantity)*Number(i.unitPrice)-Number(i.discount),0);
  const sales=total(start,end), previousSales=total(previousStart,start), expense=expenses(start,end), previousExpense=expenses(previousStart,start);
  const icons = ["settings","bell","clock","car","drop","ticket","users","cart","box","money","document","users","users","tool","chart","document"];
  const labels:Record<string,string>={"جاهزية الافتتاح والتشغيل":"الإدارة والحوكمة","الورديات والإقفال اليومي":"التشغيل اليومي","كوبونات المغسلة":"مغاسل السيارات","المخزون والزيوت والفلاتر":"المخزون","المالية والبنوك":"المالية","الموظفون والرواتب":"الموظفون والعمال"};
  const secondary=new Set(["استقبال السيارات وأوامر الخدمة","مركز الاعتمادات والتنبيهات","الهيكل التشغيلي والمسؤوليات","المستندات والنماذج"]);
  const navigation: DashboardData["navigation"] = modules.filter(m=>!secondary.has(m.label)&&m.any.some(p=>hasPermission(session.permissions,p))).map(m=>({label:labels[m.label]||m.label,href:m.href,icon:icons[modules.indexOf(m)]}));
  const financeIndex=navigation.findIndex(n=>n.label==="المالية");
  if(financeIndex>=0)navigation.splice(financeIndex+1,0,{label:"البنوك",href:"/dashboard/finance",icon:"bank"});
  if(hasPermission(session.permissions,PERMISSIONS.HR_VIEW)||hasPermission(session.permissions,PERMISSIONS.PAYROLL_PREPARE)){
    const index=navigation.findIndex(n=>n.label==="الموظفون والعمال");navigation.splice(index+1,0,{label:"الرواتب",href:"/dashboard/hr",icon:"money"});
  }
  if (hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) navigation.push({label:"مدير النظام",href:"/dashboard/admin",icon:"admin"});
  if ([PERMISSIONS.INTEGRATION_VIEW, PERMISSIONS.INTEGRATION_MANAGE].some(p=>hasPermission(session.permissions,p))) navigation.push({label:"الربط المحاسبي — مداد",href:"/dashboard/integrations/medad",icon:"document"});
  if (hasPermission(session.permissions, PERMISSIONS.MARKETING_MANAGE)) navigation.push({label:"عروض المراكز والرسائل",href:"/dashboard/marketing",icon:"ticket"});
  if (hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) navigation.push({label:"برنامج الولاء",href:"/dashboard/loyalty",icon:"ticket"});
  if ([PERMISSIONS.COUPON_REDEEM, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_EXPENSE_APPROVE, PERMISSIONS.FINANCE_EXPENSE_PAY].some(p=>hasPermission(session.permissions,p))) navigation.push({label:"كوبونات غسيل السيارات — YCD OIL",href:"/dashboard/wash",icon:"ticket"});
  const actionList = [
    {label:"استقبال سيارة",detail:"زيوت وخدمات",href:"/dashboard/service-orders",icon:"car",permission:PERMISSIONS.SERVICE_ORDER_CREATE},
    {label:"مسح كوبون الغسيل",detail:"الكاميرا واعتماد الغسلة",href:"/dashboard/coupons#coupon-scanner",icon:"ticket",permission:PERMISSIONS.COUPON_REDEEM},
    {label:"طلب شراء",detail:"المشتريات",href:"/dashboard/procurement",icon:"cart",permission:PERMISSIONS.PROCUREMENT_REQUEST},
    {label:"استلام مخزون",detail:"من المورد",href:"/dashboard/inventory",icon:"box",permission:PERMISSIONS.INVENTORY_MANAGE},
    {label:"المبيعات والعملاء",detail:"فواتير وحسابات",href:"/dashboard/customers",icon:"document",permission:PERMISSIONS.CUSTOMER_VIEW},
    {label:"سند صرف",detail:"المصروفات",href:"/dashboard/finance",icon:"money",permission:PERMISSIONS.FINANCE_VIEW},
    {label:"سند قبض",detail:"التحصيل",href:"/dashboard/receivables",icon:"money",permission:PERMISSIONS.PAYMENT_RECEIVE},
    {label:"طلب عهدة",detail:"عهد الموظفين",href:"/dashboard/custody",icon:"document",permission:PERMISSIONS.CUSTODY_REQUEST},
    {label:"الوردية اليومية",detail:openShift?"وردية مفتوحة":"فتح وإقفال",href:"/dashboard/shifts",icon:"clock",permission:PERMISSIONS.SHIFT_OPEN},
    {label:"أمر صيانة",detail:"معدات وأصول",href:"/dashboard/assets",icon:"tool",permission:PERMISSIONS.ASSET_VIEW},
  ];
  const statuses:Record<string,string>={DRAFT:"مسودة",OPEN:"مستلمة",IN_PROGRESS:"قيد التنفيذ",COMPLETED:"منتهية",CANCELLED:"ملغاة"};
  const data: DashboardData = {
    name:session.name, branch:branchState.nameAr,phase:phaseLabel,live:branchState.operationalStatus==="LIVE",navigation,
    actions:actionList.filter(a=>hasPermission(session.permissions,a.permission)),
    kpis:[
      {label:"عدد السيارات اليوم",value:serviceOrderCount,previous:previousCars,icon:"car",color:"#ff7725"},
      {label:"مبيعات الزيوت قبل الضريبة",value:categorySales("OIL",start,end),previous:categorySales("OIL",previousStart,start),money:true,icon:"drop",color:"#ff9612"},
      {label:"مبيعات الخدمات قبل الضريبة",value:categorySales("SERVICE",start,end),previous:categorySales("SERVICE",previousStart,start),money:true,icon:"tool",color:"#939497"},
      {label:"إجمالي المبيعات",value:sales,previous:previousSales,money:true,icon:"box",color:"#ffa318"},
      {label:"المصروفات التشغيلية",value:expense,previous:previousExpense,money:true,icon:"money",color:"#ff4938"},
      {label:"المبيعات ناقص المصروفات",value:sales-expense,previous:previousSales-previousExpense,money:true,icon:"money",color:"#f69b12"},
    ],
    payments:[{method:"CASH",label:"نقدي",color:"#fa9318"},{method:"CARD",label:"مدى / بطاقات",color:"#ffc225"},{method:"TRANSFER",label:"تحويل بنكي",color:"#939497"},{method:"CREDIT",label:"آجل مسجل",color:"#c5c5c6"}].map(m=>({...m,value:payments.filter(p=>p.method===m.method).reduce((n,p)=>n+Number(p.amount),0)})),
    trend:Array.from({length:7},(_,i)=>{const from=new Date(weekStart.getTime()+i*86400000),to=new Date(from.getTime()+86400000);return {label:from.toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh",day:"2-digit",month:"2-digit"}),sales:total(from,to),expenses:expenses(from,to)};}),
    branches:[{label:branchState.nameAr,sales:total(weekStart,end),expenses:expenses(weekStart,end)}],
    orders:recentOrders.map(o=>({id:o.id,plate:o.vehicle.plate,car:[o.vehicle.make,o.vehicle.model].filter(Boolean).join(" ")||"—",service:o.items.map(i=>i.descriptionAr).join(" + ")||"—",status:statuses[o.status]||o.status})),
    stock:products.map(p=>({id:p.id,name:p.nameAr,quantity:p.stockMovements.reduce((n,m)=>n+Number(m.quantity),0),minimum:Number(p.minStock)})).filter(p=>p.quantity<=p.minimum).slice(0,5),
    approvals:requests.map(r=>({id:r.id,type:"طلب شراء",number:r.requestNo,date:r.createdAt.toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh"}),href:`/dashboard/procurement/requests/${r.id}`})),
    alerts:[
      {label:"طلبات شراء",count:pendingPurchases,href:"/dashboard/approvals"},
      {label:"فواتير غير متطابقة",count:invoiceMismatches,href:"/dashboard/approvals"},
      {label:"عهد غير مقفلة",count:openCustodies,href:"/dashboard/custody"},
      {label:"مسيرات رواتب",count:draftPayrolls,href:"/dashboard/hr"},
      {label:"تنبيهات صيانة",count:maintenanceAlerts,href:"/dashboard/assets"},
      {label:"فروقات ورديات",count:pendingShiftVariances,href:"/dashboard/shifts"},
      {label:"إقفالات مالية",count:pendingFinancialCloses,href:"/dashboard/finance/closes"},
      {label:"كوبونات فعالة",count:activeCoupons,href:"/dashboard/coupons"},
    ],
  };
  return <DashboardView data={data}/>;
}
