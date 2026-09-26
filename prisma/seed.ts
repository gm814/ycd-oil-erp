import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissionCodes = [
  "dashboard.view",
  "service_order.create",
  "service_order.approve",
  "inventory.manage",
  "inventory.issue",
  "invoice.issue",
  "payment.receive",
  "customer.view",
  "credit.manage",
  "credit.sale",
  "sales_return.process",
  "shift.open",
  "shift.close",
  "shift.variance.approve",
  "finance.close.prepare",
  "finance.close.review",
  "coupon.redeem",
  "procurement.request",
  "procurement.quote",
  "procurement.approve",
  "procurement.order",
  "procurement.receive",
  "supplier_invoice.create",
  "supplier_invoice.approve_payment",
  "finance.view",
  "finance.manage",
  "finance.expense",
  "finance.expense.approve",
  "finance.expense.pay",
  "finance.bank_reconcile",
  "finance.bank_reconcile.review",
  "finance.transfer",
  "pos.settle",
  "supplier_payment.execute",
  "custody.request",
  "custody.approve",
  "custody.disburse",
  "custody.settle",
  "custody.close",
  "hr.view",
  "hr.manage",
  "attendance.manage",
  "payroll.prepare",
  "payroll.approve",
  "payroll.pay",
  "asset.view",
  "asset.manage",
  "maintenance.manage",
  "reports.view",
  "audit.view",
] as const;

const roleDefinitions: Record<string, { nameAr: string; permissions: readonly string[] }> = {
  GENERAL_MANAGER: { nameAr: "المدير العام", permissions: permissionCodes },
  FINANCE_MANAGER: {
    nameAr: "مدير المالية",
    permissions: ["dashboard.view", "invoice.issue", "payment.receive", "customer.view", "credit.manage", "credit.sale", "sales_return.process", "shift.close", "shift.variance.approve", "finance.close.prepare", "finance.close.review", "supplier_invoice.create", "supplier_invoice.approve_payment", "finance.view", "finance.manage", "finance.expense", "finance.expense.approve", "finance.expense.pay", "finance.bank_reconcile", "finance.bank_reconcile.review", "finance.transfer", "pos.settle", "supplier_payment.execute", "custody.request", "custody.approve", "custody.disburse", "custody.settle", "custody.close", "hr.view", "payroll.approve", "payroll.pay", "reports.view", "audit.view"],
  },
  OPERATIONS_MANAGER: {
    nameAr: "مدير العمليات",
    permissions: ["dashboard.view", "service_order.create", "service_order.approve", "customer.view", "inventory.issue", "shift.open", "shift.close", "shift.variance.approve", "coupon.redeem", "procurement.request", "procurement.approve", "custody.request", "custody.approve", "custody.settle", "hr.view", "attendance.manage", "asset.view", "asset.manage", "maintenance.manage", "reports.view", "audit.view"],
  },
  BRANCH_MANAGER: {
    nameAr: "مدير الفرع",
    permissions: ["dashboard.view", "service_order.create", "service_order.approve", "inventory.manage", "inventory.issue", "invoice.issue", "payment.receive", "customer.view", "sales_return.process", "shift.open", "shift.close", "coupon.redeem", "procurement.request", "procurement.quote", "procurement.approve", "procurement.order", "procurement.receive", "supplier_invoice.create", "finance.view", "custody.request", "custody.approve", "custody.settle", "hr.view", "attendance.manage", "asset.view", "asset.manage", "maintenance.manage", "reports.view", "audit.view"],
  },
  ACCOUNTANT: {
    nameAr: "المحاسب",
    permissions: ["dashboard.view", "invoice.issue", "payment.receive", "customer.view", "sales_return.process", "shift.close", "finance.close.prepare", "supplier_invoice.create", "finance.view", "finance.manage", "finance.expense", "finance.expense.pay", "finance.bank_reconcile", "finance.transfer", "pos.settle", "custody.request", "custody.disburse", "custody.settle", "custody.close", "hr.view", "payroll.prepare", "payroll.pay", "reports.view", "audit.view"],
  },
  HR_MANAGER: {
    nameAr: "مدير الموارد البشرية",
    permissions: ["dashboard.view", "hr.view", "hr.manage", "attendance.manage", "payroll.prepare", "audit.view"],
  },
  PROCUREMENT: {
    nameAr: "المشتريات",
    permissions: ["dashboard.view", "inventory.manage", "procurement.request", "procurement.quote", "procurement.order", "supplier_invoice.create"],
  },
  WAREHOUSE: {
    nameAr: "المستودع",
    permissions: ["dashboard.view", "inventory.manage", "inventory.issue", "procurement.receive"],
  },
  CASHIER: {
    nameAr: "الكاشير",
    permissions: ["dashboard.view", "payment.receive", "shift.open", "shift.close", "coupon.redeem"],
  },
  WASH_SUPERVISOR: {
    nameAr: "مشرف المغسلة",
    permissions: ["dashboard.view", "shift.open", "shift.close", "coupon.redeem"],
  },
  TECHNICIAN: {
    nameAr: "الفني",
    permissions: ["dashboard.view", "service_order.create", "procurement.request", "custody.request", "asset.view", "maintenance.manage"],
  },
  WORKER: {
    nameAr: "العامل",
    permissions: ["dashboard.view"],
  },
};

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "ycd-oil" },
    update: {},
    create: {
      id: "ycd-oil",
      nameAr: "شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
      brandName: "YCD OIL",
      vatNumber: "311380910800003",
      crNumber: "1009014238",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: "riyadh-tuwaiq" },
    update: {},
    create: {
      id: "riyadh-tuwaiq",
      organizationId: organization.id,
      nameAr: "الفرع الأول – الرياض - حي طويق",
      city: "الرياض",
    },
  });

  await prisma.financialAccount.upsert({
    where: { branchId_code: { branchId: branch.id, code: "CASH-MAIN" } },
    update: { nameAr: "الصندوق الرئيسي", type: "CASH", active: true },
    create: { branchId: branch.id, code: "CASH-MAIN", nameAr: "الصندوق الرئيسي", type: "CASH" },
  });

  await prisma.financialAccount.upsert({
    where: { branchId_code: { branchId: branch.id, code: "BANK-MAIN" } },
    update: {
      nameAr: "مصرف الراجحي - شركة وجهتك الإبداعية لخدمات السيارات",
      type: "BANK",
      bankName: "مصرف الراجحي",
      accountNumber: "528000010006080781162",
      iban: "SA7180000528608010781162",
      active: true,
    },
    create: {
      branchId: branch.id,
      code: "BANK-MAIN",
      nameAr: "مصرف الراجحي - شركة وجهتك الإبداعية لخدمات السيارات",
      type: "BANK",
      bankName: "مصرف الراجحي",
      accountNumber: "528000010006080781162",
      iban: "SA7180000528608010781162",
    },
  });

  await prisma.financialAccount.upsert({
    where: { branchId_code: { branchId: branch.id, code: "POS-MAIN" } },
    update: { nameAr: "تسويات مدى والشبكة", type: "POS_CLEARING", active: true },
    create: { branchId: branch.id, code: "POS-MAIN", nameAr: "تسويات مدى والشبكة", type: "POS_CLEARING" },
  });

  const permissionByCode = new Map<string, { id: string }>();
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
    permissionByCode.set(code, permission);
  }

  const roles = new Map<string, { id: string }>();
  for (const [code, definition] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { nameAr: definition.nameAr },
      create: { code, nameAr: definition.nameAr },
    });
    roles.set(code, role);

    for (const permissionCode of definition.permissions) {
      const permission = permissionByCode.get(permissionCode);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const staff = [
    { code: "YCD-001", nameAr: "أبوبكر نبيل سيف", jobTitleAr: "المدير العام" },
    { code: "YCD-002", nameAr: "حمزة عبدالرحمن سعيد الذبحاني", jobTitleAr: "مدير الفرع / المشتريات" },
    { code: "YCD-003", nameAr: "هاني عبدالسلام الذبحاني", jobTitleAr: "المحاسب / الموارد البشرية" },
    { code: "YCD-004", nameAr: "ضياء فرحان المخلافي", jobTitleAr: "المحاسب العام" },
    { code: "YCD-005", nameAr: "عمار البخيتي", jobTitleAr: "الكاشير" },
    { code: "YCD-006", nameAr: "محمد نجيب عثمان حمادي", jobTitleAr: "المستودع / فني" },
    { code: "YCD-007", nameAr: "عمار النابهي", jobTitleAr: "فني" },
    { code: "YCD-008", nameAr: "محمد المهدي ازهري", jobTitleAr: "مشرف المغسلة" },
  ] as const;

  for (const employee of staff) {
    await prisma.employee.upsert({
      where: { code: employee.code },
      update: {
        branchId: branch.id,
        nameAr: employee.nameAr,
        jobTitleAr: employee.jobTitleAr,
        active: true,
      },
      create: {
        branchId: branch.id,
        code: employee.code,
        nameAr: employee.nameAr,
        jobTitleAr: employee.jobTitleAr,
        active: true,
      },
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {
        name: "مدير النظام",
        passwordHash,
        branchId: branch.id,
        status: "ACTIVE",
      },
      create: {
        email: adminEmail.toLowerCase(),
        name: "مدير النظام",
        passwordHash,
        branchId: branch.id,
      },
    });

    const gmRole = roles.get("GENERAL_MANAGER");
    if (!gmRole) throw new Error("GENERAL_MANAGER_ROLE_MISSING");

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: gmRole.id } },
      update: {},
      create: { userId: admin.id, roleId: gmRole.id },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
