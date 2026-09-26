import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PREOPENING_VERIFY_FAILED: ${message}`);
}

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: "riyadh-tuwaiq" },
    select: { id: true, nameAr: true, operationalStatus: true },
  });
  assert(branch, "فرع طويق غير موجود");
  assert(branch.operationalStatus === "PREOPENING", "فرع طويق يجب أن يبقى PREOPENING قبل الإطلاق");

  const bank = await prisma.financialAccount.findUnique({
    where: { branchId_code: { branchId: branch.id, code: "BANK-MAIN" } },
  });
  assert(bank, "حساب مصرف الراجحي الرئيسي غير موجود");
  assert(bank.type === "BANK", "BANK-MAIN يجب أن يكون حسابًا بنكيًا");
  assert(bank.bankName === "مصرف الراجحي", "اسم البنك غير مطابق للبيانات المعتمدة");
  assert(bank.accountNumber === "528000010006080781162", "رقم حساب الراجحي غير مطابق");
  assert(bank.iban === "SA7180000528608010781162", "رقم IBAN غير مطابق لشهادة البنك");

  const bankBalance = await prisma.financialTransaction.aggregate({
    where: { branchId: branch.id, accountId: bank.id },
    _sum: { amount: true },
  });
  assert(Number(bankBalance._sum.amount ?? 0) === 17000, "الرصيد البنكي الافتتاحي يجب أن يكون 17,000 ر.س");

  const parent = await prisma.groupCompany.findUnique({
    where: { code: "CREATIVE-FACADES-CONTRACTING" },
  });
  assert(parent, "الشركة الرئيسية الممولة غير مسجلة");
  assert(parent.legalNameAr === "شركة الواجهات الإبداعية للمقاولات", "اسم الشركة الرئيسية غير مطابق");
  assert(parent.relationType === "PARENT", "علاقة الشركة الرئيسية يجب أن تكون PARENT");

  const funding = await prisma.groupFunding.aggregate({
    where: { branchId: branch.id, sourceCompanyId: parent.id, accountId: bank.id },
    _sum: { amount: true },
    _count: true,
  });
  assert(funding._count >= 1, "لا توجد حركة تمويل افتتاحية من الشركة الرئيسية");
  assert(Number(funding._sum.amount ?? 0) === 17000, "إجمالي التمويل الافتتاحي يجب أن يكون 17,000 ر.س");

  const expectedPreopening = new Map([
    ["11080301", 18235],
    ["11080302", 141927.71],
    ["11080303", 52170.19],
  ]);
  const preopeningAccounts = await prisma.preopeningLedgerAccount.findMany({
    where: { branchId: branch.id },
    include: { entries: true },
  });
  assert(preopeningAccounts.length === 3, "يجب تحميل ثلاثة حسابات مصدر لما قبل التشغيل");
  const reportedPreopeningTotal = preopeningAccounts.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const importedPreopeningTotal = preopeningAccounts.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0,
  );
  const preopeningEntryCount = preopeningAccounts.reduce((sum, account) => sum + account.entries.length, 0);
  assert(Math.abs(reportedPreopeningTotal - 212332.9) < 0.01, "إجمالي كشوف ما قبل التشغيل يجب أن يكون 212,332.90 ر.س");
  assert(Math.abs(importedPreopeningTotal - reportedPreopeningTotal) < 0.01, "تفاصيل قيود ما قبل التشغيل لا تطابق الأرصدة المصدرية");
  assert(preopeningEntryCount === 33, "عدد قيود ما قبل التشغيل المستوردة يجب أن يكون 33");
  for (const account of preopeningAccounts) {
    const expected = expectedPreopening.get(account.sourceAccountNo);
    assert(expected !== undefined, `حساب مصدر غير متوقع: ${account.sourceAccountNo}`);
    assert(Math.abs(Number(account.reportedBalance) - expected) < 0.01, `رصيد المصدر ${account.sourceAccountNo} غير مطابق`);
  }

  const expectedStaff = [
    ["YCD-001", "أبوبكر نبيل سيف"],
    ["YCD-002", "حمزة عبدالرحمن سعيد الذبحاني"],
    ["YCD-003", "هاني عبدالسلام الذبحاني"],
    ["YCD-004", "ضياء فرحان المخلافي"],
    ["YCD-005", "عمار البخيتي"],
    ["YCD-006", "محمد نجيب عثمان حمادي"],
    ["YCD-007", "عمار النابهي"],
    ["YCD-008", "محمد المهدي ازهري"],
  ] as const;

  const employees = await prisma.employee.findMany({
    where: { branchId: branch.id, active: true },
    select: { code: true, nameAr: true },
  });
  const byCode = new Map(employees.map((employee) => [employee.code, employee.nameAr]));
  for (const [code, nameAr] of expectedStaff) {
    assert(byCode.get(code) === nameAr, `بيانات الموظف ${code} غير مطابقة`);
  }

  const [shifts, serviceOrders, invoices, payments] = await Promise.all([
    prisma.shift.count({ where: { branchId: branch.id } }),
    prisma.serviceOrder.count({ where: { branchId: branch.id } }),
    prisma.invoice.count({ where: { serviceOrder: { branchId: branch.id } } }),
    prisma.payment.count({ where: { invoice: { serviceOrder: { branchId: branch.id } } } }),
  ]);
  assert(shifts === 0 && serviceOrders === 0 && invoices === 0 && payments === 0,
    "بيانات Seed قبل التشغيل يجب ألا تحتوي على مبيعات أو ورديات تشغيلية");

  console.log("YCD PREOPENING VERIFIED");
  console.log(`Branch: ${branch.nameAr}`);
  console.log("Bank opening balance: 17000 SAR");
  console.log(`Registered staff: ${expectedStaff.length}`);
  console.log(`Preopening accountant ledger: ${reportedPreopeningTotal.toFixed(2)} SAR / ${preopeningEntryCount} entries`);
  console.log("Commercial operations: not started");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
