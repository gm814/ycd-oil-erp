import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissionCodes = [
  "dashboard.view",
  "user.manage",
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
  "finance.group_funding",
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
    permissions: ["dashboard.view", "invoice.issue", "payment.receive", "customer.view", "credit.manage", "credit.sale", "sales_return.process", "shift.close", "shift.variance.approve", "finance.close.prepare", "finance.close.review", "supplier_invoice.create", "supplier_invoice.approve_payment", "finance.view", "finance.manage", "finance.group_funding", "finance.expense", "finance.expense.approve", "finance.expense.pay", "finance.bank_reconcile", "finance.bank_reconcile.review", "finance.transfer", "pos.settle", "supplier_payment.execute", "custody.request", "custody.approve", "custody.disburse", "custody.settle", "custody.close", "hr.view", "payroll.approve", "payroll.pay", "reports.view", "audit.view"],
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

  const bankAccount = await prisma.financialAccount.upsert({
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

  const openingBankTransaction = await prisma.financialTransaction.upsert({
    where: { idempotencyKey: "opening-bank-main-2026-09-26" },
    update: {
      branchId: branch.id,
      accountId: bankAccount.id,
      type: "OPENING_BALANCE",
      amount: 17000,
      reference: "OPENING-2026-09-26",
      descriptionAr: "الرصيد الافتتاحي لحساب مصرف الراجحي — تمويل من شركة الواجهات الإبداعية للمقاولات",
      performedBy: "SYSTEM-SEED",
    },
    create: {
      branchId: branch.id,
      accountId: bankAccount.id,
      type: "OPENING_BALANCE",
      amount: 17000,
      reference: "OPENING-2026-09-26",
      descriptionAr: "الرصيد الافتتاحي لحساب مصرف الراجحي — تمويل من شركة الواجهات الإبداعية للمقاولات",
      performedBy: "SYSTEM-SEED",
      idempotencyKey: "opening-bank-main-2026-09-26",
    },
  });

  const parentCompany = await prisma.groupCompany.upsert({
    where: { code: "CREATIVE-FACADES-CONTRACTING" },
    update: {
      organizationId: organization.id,
      legalNameAr: "شركة الواجهات الإبداعية للمقاولات",
      relationType: "PARENT",
      active: true,
    },
    create: {
      organizationId: organization.id,
      code: "CREATIVE-FACADES-CONTRACTING",
      legalNameAr: "شركة الواجهات الإبداعية للمقاولات",
      relationType: "PARENT",
    },
  });

  await prisma.groupFunding.upsert({
    where: { fundingNo: "FUND-OPENING-20260926" },
    update: {
      branchId: branch.id,
      sourceCompanyId: parentCompany.id,
      accountId: bankAccount.id,
      amount: 17000,
      reference: "OPENING-2026-09-26",
      notes: "الرصيد البنكي الافتتاحي قبل بدء التشغيل الفعلي للمركز.",
      fundedAt: new Date("2026-09-26T00:00:00+03:00"),
      transactionId: openingBankTransaction.id,
      createdBy: "SYSTEM-SEED",
    },
    create: {
      fundingNo: "FUND-OPENING-20260926",
      branchId: branch.id,
      sourceCompanyId: parentCompany.id,
      accountId: bankAccount.id,
      amount: 17000,
      reference: "OPENING-2026-09-26",
      notes: "الرصيد البنكي الافتتاحي قبل بدء التشغيل الفعلي للمركز.",
      fundedAt: new Date("2026-09-26T00:00:00+03:00"),
      transactionId: openingBankTransaction.id,
      createdBy: "SYSTEM-SEED",
    },
  });

  const setupToolsAcquisition = await prisma.assetAcquisition.upsert({
    where: { acquisitionNo: "ACQ-TWQ-20260926-219" },
    update: {
      branchId: branch.id,
      supplierName: "مؤسسة ايكو بلو فرع الريل",
      supplierVatNumber: "312331574400003",
      invoiceNo: "219",
      invoiceDate: new Date("2026-09-26T00:00:00+03:00"),
      purchaserName: "شركة الواجهات الابداعية للمقاولات",
      purchaserVatNumber: "311380910800003",
      fundingCompanyName: "شركة الواجهات الإبداعية للمقاولات",
      subtotal: 7021,
      discount: 34.91,
      vatAmount: 1047.91,
      total: 8034,
      notes: "عدد وأدوات وتجهيزات تشغيلية مخصصة لمركز YCD OIL فرع طويق قبل بدء التشغيل الفعلي. الفاتورة نقدية وتضم 44 بندًا بإجمالي 61 وحدة.",
    },
    create: {
      acquisitionNo: "ACQ-TWQ-20260926-219",
      branchId: branch.id,
      supplierName: "مؤسسة ايكو بلو فرع الريل",
      supplierVatNumber: "312331574400003",
      invoiceNo: "219",
      invoiceDate: new Date("2026-09-26T00:00:00+03:00"),
      purchaserName: "شركة الواجهات الابداعية للمقاولات",
      purchaserVatNumber: "311380910800003",
      fundingCompanyName: "شركة الواجهات الإبداعية للمقاولات",
      subtotal: 7021,
      discount: 34.91,
      vatAmount: 1047.91,
      total: 8034,
      notes: "عدد وأدوات وتجهيزات تشغيلية مخصصة لمركز YCD OIL فرع طويق قبل بدء التشغيل الفعلي. الفاتورة نقدية وتضم 44 بندًا بإجمالي 61 وحدة.",
    },
  });

  await prisma.assetAcquisitionItem.deleteMany({ where: { acquisitionId: setupToolsAcquisition.id } });
  await prisma.assetAcquisitionItem.createMany({
    data: [
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GK-10010", nameAr: "طقم مفتاح جير ثابت 10 قطعة GOOD KING", quantity: 1, unitCost: 180, lineSubtotal: 180 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "HQ424AA", nameAr: "طقم حبوب 1/2 24 قطع HQ", quantity: 1, unitCost: 170, lineSubtotal: 170 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "HQ16-3/8", nameAr: "طقم حبوب 16 قطعة 3/8 HQ", quantity: 1, unitCost: 185, lineSubtotal: 185 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GK10031", nameAr: "طقم مفتاح سيفون 31 قطعة GOOD KING", quantity: 1, unitCost: 350, lineSubtotal: 350 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GKRHE72-1/2", nameAr: "يد تماتيك بستم 1/2 GOOD KING", quantity: 1, unitCost: 80, lineSubtotal: 80 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GKRHE72-3/8", nameAr: "يد تماتيك بستم 3/8 GOOD KING", quantity: 1, unitCost: 65, lineSubtotal: 65 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "HQ-2.5M-17M-10PCS", nameAr: "طقم النكي 10 قطع كروم HQ 2.5M-17M", quantity: 1, unitCost: 55, lineSubtotal: 55 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "55515", nameAr: "سستة ملقط ليزر كوبرا", quantity: 1, unitCost: 22, lineSubtotal: 22 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "G-KING1415-1/2", nameAr: "دريل كفرات 1/2 G-KING BLACK", quantity: 1, unitCost: 190, lineSubtotal: 190 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "6379200", nameAr: "توصيلة يد اتوماتيك 1/2*20 (MM500) تايواني", quantity: 1, unitCost: 75, lineSubtotal: 75 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "HQEB10-1/2", nameAr: "وصلة 1/2 10 كروم HQ", quantity: 2, unitCost: 20, lineSubtotal: 40 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "T10M", nameAr: "مفتاح حرف تي 10 ملي", quantity: 1, unitCost: 10, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "T8M", nameAr: "مفتاح حرف تي 8 ملي", quantity: 1, unitCost: 10, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "515", nameAr: "لي حلزوني ازرق 15 متر 8MM", quantity: 2, unitCost: 45, lineSubtotal: 90 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GK-320 3/8", nameAr: "طقم حبوب 3/8 20 قطعة GOOD KING", quantity: 1, unitCost: 150, lineSubtotal: 150 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "55526", nameAr: "مفك كروم يد ربر 300 ملي عادي كوبرا", quantity: 1, unitCost: 15, lineSubtotal: 15 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "55530", nameAr: "مفك كروم يد ربر 300 ملي مربع كوبرا", quantity: 1, unitCost: 15, lineSubtotal: 15 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "55523", nameAr: "مفك كروم يد ربر 150 مل عادي كوبرا", quantity: 1, unitCost: 10, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "55527", nameAr: "مفك كروم يد ربر 150 ملي مربع كوبرا", quantity: 1, unitCost: 10, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GK-424S-12", nameAr: "طقم حبوب 1/2 مشرشر 24 قطعة GOOD KING", quantity: 1, unitCost: 220, lineSubtotal: 220 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "5556", nameAr: "مشرط ملبس راس سحب COBRA", quantity: 1, unitCost: 4, lineSubtotal: 4 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "2915", nameAr: "مزيتة برميل يدوي ايطالي", quantity: 1, unitCost: 350, lineSubtotal: 350 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "9394", nameAr: "مكينة شفط زيت اوروبي 90مم", quantity: 1, unitCost: 3200, lineSubtotal: 3200 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "9344", nameAr: "مسدس تنفيخ ايطالي طويل", quantity: 2, unitCost: 50, lineSubtotal: 100 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "653", nameAr: "بلف تعبئة كفرات ياباني", quantity: 2, unitCost: 50, lineSubtotal: 100 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "GK-BT40", nameAr: "طقم لقم 40 قطعة GOOD KING", quantity: 1, unitCost: 150, lineSubtotal: 150 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "040006", nameAr: "اوسكو دريل تخريم مقاس 13مم 710 واط", quantity: 1, unitCost: 220, lineSubtotal: 220 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "HQ-800", nameAr: "زرادية عادي 8 بوصة ازرق GERMANY HQ", quantity: 1, unitCost: 45, lineSubtotal: 45 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "WAR1/2", nameAr: "طقم حبوب نجمة قصيرة 10 حبة 1/2 تايوني", quantity: 1, unitCost: 80, lineSubtotal: 80 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "010167", nameAr: "شاكوش قلاعي يد ربل 500 غ", quantity: 1, unitCost: 40, lineSubtotal: 40 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "100154", nameAr: "زرادية بوز 8 بوصة BAUM", quantity: 1, unitCost: 35, lineSubtotal: 35 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "100157", nameAr: "زرادية نجار 8 بوصة BAUM", quantity: 1, unitCost: 25, lineSubtotal: 25 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001492", nameAr: "متر 10 متر", quantity: 1, unitCost: 20, lineSubtotal: 20 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "VISE GRIP-10", nameAr: "زرادية كبس 10 بوصة VISE GRIP", quantity: 1, unitCost: 50, lineSubtotal: 50 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "5555", nameAr: "مشرط المنيوم COBRA", quantity: 1, unitCost: 10, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "5553", nameAr: "علبة غيار مشرط عادي 10 حبة", quantity: 2, unitCost: 5, lineSubtotal: 10 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001932", nameAr: "شاكوش لحام تايوني", quantity: 1, unitCost: 50, lineSubtotal: 50 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1212", nameAr: "مفتاح سيفون عقرب صغير امريكي", quantity: 1, unitCost: 100, lineSubtotal: 100 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001930", nameAr: "مفتاح سيفون عقرب كبير امريكي", quantity: 1, unitCost: 150, lineSubtotal: 150 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "141", nameAr: "مفتاح فلتر اصلي تايوني", quantity: 4, unitCost: 50, lineSubtotal: 200 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001934", nameAr: "مسدس غسيل ديزل كروم", quantity: 1, unitCost: 50, lineSubtotal: 50 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "14141", nameAr: "تيب سباكة", quantity: 10, unitCost: 3, lineSubtotal: 30 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001937", nameAr: "مفتاح تماتيك 16 رومينو", quantity: 1, unitCost: 30, lineSubtotal: 30 },
      { acquisitionId: setupToolsAcquisition.id, itemCode: "1001417", nameAr: "صوفه 200 بار M", quantity: 1, unitCost: 30, lineSubtotal: 30 },
    ],
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
