import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CONTROL_VERIFY_FAILED: ${message}`);
}

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: "riyadh-tuwaiq" },
    select: { id: true, operationalStatus: true },
  });
  assert(branch, "فرع طويق غير موجود");

  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
  });
  const roleMap = new Map(
    roles.map((role) => [role.code, new Set(role.permissions.map((entry) => entry.permission.code))]),
  );
  const permissions = await prisma.permission.findMany({ select: { code: true } });
  const allPermissionCodes = new Set(permissions.map((permission) => permission.code));

  const requiredPermissions = [
    "operations.go_live",
    "operations.uat",
    "shift.variance.approve",
    "finance.close.prepare",
    "finance.close.review",
    "finance.expense",
    "finance.expense.approve",
    "finance.expense.pay",
    "finance.bank_reconcile",
    "finance.bank_reconcile.review",
    "supplier_invoice.approve_payment",
    "supplier_payment.execute",
    "payroll.prepare",
    "payroll.approve",
    "payroll.pay",
    "audit.view",
  ];
  for (const permission of requiredPermissions) {
    assert(allPermissionCodes.has(permission), `الصلاحية الرقابية غير موجودة: ${permission}`);
  }

  const gm = roleMap.get("GENERAL_MANAGER");
  assert(gm, "دور المدير العام غير موجود");
  for (const permission of allPermissionCodes) {
    assert(gm.has(permission), `المدير العام لا يملك الصلاحية ${permission}`);
  }

  const restrictedRoles = ["CASHIER", "WAREHOUSE", "TECHNICIAN", "WASH_SUPERVISOR"];
  const approvalPermissions = [
    "operations.go_live",
    "shift.variance.approve",
    "finance.close.review",
    "finance.expense.approve",
    "finance.bank_reconcile.review",
    "supplier_invoice.approve_payment",
    "supplier_payment.execute",
    "payroll.approve",
  ];
  for (const roleCode of restrictedRoles) {
    const role = roleMap.get(roleCode);
    assert(role, `الدور التشغيلي غير موجود: ${roleCode}`);
    for (const permission of approvalPermissions) {
      assert(!role.has(permission), `${roleCode} يجب ألا يملك صلاحية الاعتماد ${permission}`);
    }
  }

  const branchManager = roleMap.get("BRANCH_MANAGER");
  assert(branchManager, "دور مدير الفرع غير موجود");
  assert(branchManager.has("operations.uat"), "مدير الفرع يجب أن يستطيع تنفيذ UAT");
  assert(!branchManager.has("operations.go_live"), "مدير الفرع لا يجب أن يملك قرار GO LIVE النهائي");

  const accountant = roleMap.get("ACCOUNTANT");
  assert(accountant, "دور المحاسب غير موجود");
  assert(accountant.has("finance.close.prepare"), "المحاسب يجب أن يستطيع إعداد الإقفال");
  assert(!accountant.has("finance.close.review"), "المحاسب المعد للإقفال لا يجب أن يملك صلاحية المراجعة النهائية");

  const financeManager = roleMap.get("FINANCE_MANAGER");
  assert(financeManager, "دور مدير المالية غير موجود");
  assert(financeManager.has("finance.close.review"), "مدير المالية يجب أن يملك مراجعة الإقفال");
  assert(financeManager.has("finance.expense.approve"), "مدير المالية يجب أن يملك اعتماد المصروف");
  assert(financeManager.has("finance.bank_reconcile.review"), "مدير المالية يجب أن يملك مراجعة المطابقة البنكية");

  const [bank, cash, pos] = await Promise.all([
    prisma.financialAccount.findUnique({ where: { branchId_code: { branchId: branch.id, code: "BANK-MAIN" } } }),
    prisma.financialAccount.findUnique({ where: { branchId_code: { branchId: branch.id, code: "CASH-MAIN" } } }),
    prisma.financialAccount.findUnique({ where: { branchId_code: { branchId: branch.id, code: "POS-MAIN" } } }),
  ]);
  assert(bank?.type === "BANK" && bank.active, "الحساب البنكي الرئيسي غير جاهز");
  assert(cash?.type === "CASH" && cash.active, "الصندوق الرئيسي غير جاهز");
  assert(pos?.type === "POS_CLEARING" && pos.active, "حساب تسويات مدى غير جاهز");

  const syntheticOpening = await prisma.financialTransaction.findUnique({
    where: { idempotencyKey: "opening-bank-main-2026-09-26" },
  });
  const confirmedOpening = await prisma.financialTransaction.findUnique({
    where: { idempotencyKey: "opening-bank-main-confirmed-2026-09-29" },
  });
  const salesReceipts = await prisma.financialTransaction.count({
    where: { branchId: branch.id, type: "CUSTOMER_RECEIPT" },
  });
  assert(!syntheticOpening, "لا يجوز إبقاء رصيد افتتاحي تقديري قديم داخل Seed");
  assert(confirmedOpening, "الرصيد الافتتاحي البنكي المعتمد غير موجود");
  assert(confirmedOpening.accountId === bank.id, "الرصيد الافتتاحي المعتمد يجب أن يكون على BANK-MAIN");
  assert(confirmedOpening.type === "OPENING_BALANCE", "الرصيد الافتتاحي المعتمد يجب أن يسجل كـ OPENING_BALANCE");
  assert(Math.abs(Number(confirmedOpening.amount) - 17000) < 0.01, "الرصيد الافتتاحي المعتمد يجب أن يساوي 17,000 ر.س");
  if (branch.operationalStatus === "PREOPENING") {
    assert(salesReceipts === 0, "لا يجب وجود تحصيلات عملاء فعلية أثناء PREOPENING في بيانات الأساس");
  }

  const employees = await prisma.employee.findMany({
    where: { branchId: branch.id, active: true },
    select: { code: true, nameAr: true },
  });
  const requiredEmployees = new Map([
    ["YCD-001", "أبوبكر نبيل سيف"],
    ["YCD-002", "حمزة عبدالرحمن سعيد الذبحاني"],
    ["YCD-003", "هاني عبدالسلام الذبحاني"],
    ["YCD-004", "ضياء فرحان المخلافي"],
    ["YCD-005", "عمار البخيتي"],
    ["YCD-006", "محمد نجيب عثمان حمادي"],
    ["YCD-007", "عمار النابهي"],
    ["YCD-008", "محمد المهدي ازهري"],
  ]);
  const employeeMap = new Map(employees.map((employee) => [employee.code, employee.nameAr]));
  for (const [code, name] of requiredEmployees) {
    assert(employeeMap.get(code) === name, `الموظف ${code} غير مطابق للهيكل التشغيلي`);
  }

  console.log("YCD INTERNAL CONTROLS VERIFIED");
  console.log(`Permissions: ${allPermissionCodes.size}`);
  console.log(`Roles: ${roles.length}`);
  console.log(`Operational staff: ${requiredEmployees.size}`);
  console.log("Segregation of duties: verified");
  console.log("Core financial accounts: verified");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
