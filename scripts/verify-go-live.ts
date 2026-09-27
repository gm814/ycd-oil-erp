import { PrismaClient } from "@prisma/client";
import { operationalTeam } from "../lib/operations";
import { UAT_CASES } from "../lib/uat";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`GO_LIVE_VERIFY_FAILED: ${message}`);
}

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: "riyadh-tuwaiq" },
    select: { id: true, nameAr: true, operationalStatus: true },
  });
  assert(branch, "فرع طويق غير موجود");

  const [
    employees,
    bankAccounts,
    physicalProducts,
    serviceProducts,
    openingStockMovements,
    suppliers,
    uatResults,
    preopeningAccounts,
    openShifts,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { branchId: branch.id, active: true },
      select: {
        code: true,
        nameAr: true,
        hireDate: true,
        user: {
          select: {
            status: true,
            passwordHash: true,
            roles: { select: { role: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.financialAccount.findMany({
      where: { branchId: branch.id, active: true, type: "BANK" },
      select: { bankName: true, accountNumber: true, iban: true },
    }),
    prisma.product.count({ where: { active: true, category: { not: "SERVICE" } } }),
    prisma.product.count({ where: { active: true, category: "SERVICE" } }),
    prisma.stockMovement.count({ where: { branchId: branch.id, quantity: { gt: 0 } } }),
    prisma.supplier.count({ where: { active: true } }),
    prisma.uatTestResult.findMany({
      where: { branchId: branch.id },
      select: { caseCode: true, status: true, evidenceRef: true },
    }),
    prisma.preopeningLedgerAccount.findMany({
      where: { branchId: branch.id },
      include: { entries: { select: { debit: true, credit: true } } },
    }),
    prisma.shift.count({ where: { branchId: branch.id, closedAt: null } }),
  ]);

  const employeeByCode = new Map(employees.map((employee) => [employee.code, employee]));
  for (const member of operationalTeam) {
    const employee = employeeByCode.get(member.code);
    assert(employee, `الموظف التشغيلي غير مسجل: ${member.nameAr}`);
    assert(employee.nameAr === member.nameAr, `اسم الموظف ${member.code} لا يطابق الهيكل المعتمد`);
    assert(employee.hireDate, `تاريخ تعيين ${member.nameAr} غير مكتمل`);
    assert(employee.user?.status === "ACTIVE" && employee.user.passwordHash, `حساب دخول ${member.nameAr} غير جاهز`);
    const roleCodes = new Set(employee.user.roles.map((entry) => entry.role.code));
    for (const roleCode of member.systemRoleCodes) {
      assert(roleCodes.has(roleCode), `الموظف ${member.nameAr} لا يملك الدور المطلوب ${roleCode}`);
    }
  }

  const bankReady = bankAccounts.some((account) =>
    account.bankName === "مصرف الراجحي" &&
    account.accountNumber === "528000010006080781162" &&
    account.iban === "SA7180000528608010781162"
  );
  assert(bankReady, "الحساب البنكي المعتمد من شهادة IBAN غير مكتمل أو غير مطابق");

  assert(physicalProducts > 0, "دليل الزيوت والفلاتر والقطع لم يُحمّل");
  assert(serviceProducts > 0, "دليل الخدمات والأسعار لم يُحمّل");
  assert(openingStockMovements > 0, "الجرد الافتتاحي للمخزون غير موجود");
  assert(suppliers > 0, "الموردون الأساسيون غير مسجلين");

  const passedWithEvidence = new Set(
    uatResults
      .filter((result) => result.status === "PASSED" && Boolean(result.evidenceRef?.trim()))
      .map((result) => result.caseCode),
  );
  for (const testCase of UAT_CASES) {
    assert(passedWithEvidence.has(testCase.code), `اختبار UAT غير مكتمل أو بلا دليل: ${testCase.code} — ${testCase.titleAr}`);
  }

  assert(preopeningAccounts.length > 0, "سجل تكاليف ما قبل التشغيل غير موجود");
  const reported = preopeningAccounts.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const imported = preopeningAccounts.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0,
  );
  assert(Math.abs(reported - imported) <= 0.01, `سجل ما قبل التشغيل غير متطابق؛ الفرق ${(reported - imported).toFixed(2)} ر.س`);
  assert(openShifts === 0, "يوجد وردية مفتوحة؛ يجب إقفال جميع الورديات قبل قرار GO LIVE");

  console.log("YCD GO-LIVE GATE VERIFIED");
  console.log(`Branch: ${branch.nameAr}`);
  console.log(`Operational status: ${branch.operationalStatus}`);
  console.log(`Operational team: ${operationalTeam.length} / ${operationalTeam.length}`);
  console.log(`Physical products: ${physicalProducts}`);
  console.log(`Services: ${serviceProducts}`);
  console.log(`Opening stock movements: ${openingStockMovements}`);
  console.log(`Suppliers: ${suppliers}`);
  console.log(`UAT passed with evidence: ${passedWithEvidence.size} / ${UAT_CASES.length}`);
  console.log(`Preopening ledger variance: ${(reported - imported).toFixed(2)} SAR`);
  console.log("Open shifts: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
