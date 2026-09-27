import { db } from "@/lib/db";
import { operationalTeam } from "@/lib/operations";

export const GO_LIVE_REQUIREMENTS = {
  EMPLOYEES: "EMPLOYEES",
  USER_ACCOUNTS: "USER_ACCOUNTS",
  USER_ROLE_PLAN: "USER_ROLE_PLAN",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  OPENING_BANK_BALANCE: "OPENING_BANK_BALANCE",
  FUNDING_SOURCE: "FUNDING_SOURCE",
  PREOPENING_LEDGER_RECONCILIATION: "PREOPENING_LEDGER_RECONCILIATION",
  PRODUCT_CATALOG: "PRODUCT_CATALOG",
  SERVICE_CATALOG: "SERVICE_CATALOG",
  OPENING_STOCK: "OPENING_STOCK",
  SUPPLIERS: "SUPPLIERS",
  OPEN_SHIFT: "OPEN_SHIFT",
} as const;

export type GoLiveRequirementCode = typeof GO_LIVE_REQUIREMENTS[keyof typeof GO_LIVE_REQUIREMENTS];

export async function evaluateGoLiveReadiness(branchId: string) {
  const [
    branch,
    employees,
    bankAccounts,
    openingBankBalance,
    parentCompanies,
    groupFunding,
    serviceProducts,
    physicalProducts,
    openingStockMovements,
    suppliers,
    preopeningAccounts,
    openShifts,
  ] = await Promise.all([
    db.branch.findUnique({ where: { id: branchId } }),
    db.employee.findMany({
      where: { branchId, active: true },
      select: {
        code: true,
        user: {
          select: {
            status: true,
            passwordHash: true,
            roles: { select: { role: { select: { code: true } } } },
          },
        },
      },
    }),
    db.financialAccount.findMany({
      where: { branchId, active: true, type: "BANK" },
      select: { bankName: true, accountNumber: true, iban: true },
    }),
    db.financialTransaction.aggregate({
      where: { branchId, type: "OPENING_BALANCE", account: { type: "BANK" } },
      _sum: { amount: true },
    }),
    db.groupCompany.count({
      where: {
        organization: { branches: { some: { id: branchId } } },
        relationType: "PARENT",
        active: true,
      },
    }),
    db.groupFunding.aggregate({ where: { branchId }, _sum: { amount: true } }),
    db.product.count({ where: { active: true, category: "SERVICE" } }),
    db.product.count({ where: { active: true, category: { not: "SERVICE" } } }),
    db.stockMovement.count({ where: { branchId, quantity: { gt: 0 } } }),
    db.supplier.count({ where: { active: true } }),
    db.preopeningLedgerAccount.findMany({
      where: { branchId },
      include: { entries: { select: { debit: true, credit: true } } },
    }),
    db.shift.count({ where: { branchId, closedAt: null } }),
  ]);

  const openingBalance = Number(openingBankBalance._sum.amount ?? 0);
  const fundingTotal = Number(groupFunding._sum.amount ?? 0);
  const bankReady = bankAccounts.some((account) => account.bankName && account.accountNumber && account.iban);
  const employeeByCode = new Map(employees.map((employee) => [employee.code, employee]));
  const accountPlan = operationalTeam.map((member) => {
    const employee = employeeByCode.get(member.code);
    const user = employee?.user;
    const actualRoles = new Set(user?.roles.map((entry) => entry.role.code) ?? []);
    return {
      code: member.code,
      accountReady: Boolean(user?.status === "ACTIVE" && user.passwordHash),
      rolesReady: member.systemRoleCodes.every((roleCode) => actualRoles.has(roleCode)),
    };
  });
  const activeUsers = accountPlan.filter((item) => item.accountReady).length;
  const roleReadyUsers = accountPlan.filter((item) => item.accountReady && item.rolesReady).length;
  const preopeningReportedTotal = preopeningAccounts.reduce((sum, account) => sum + Number(account.reportedBalance), 0);
  const preopeningImportedTotal = preopeningAccounts.reduce(
    (sum, account) => sum + account.entries.reduce((entrySum, entry) => entrySum + Number(entry.debit) - Number(entry.credit), 0),
    0,
  );
  const preopeningLedgerVariance = preopeningReportedTotal - preopeningImportedTotal;

  const missing: GoLiveRequirementCode[] = [];
  if (employees.length < operationalTeam.length) missing.push(GO_LIVE_REQUIREMENTS.EMPLOYEES);
  if (activeUsers < operationalTeam.length) missing.push(GO_LIVE_REQUIREMENTS.USER_ACCOUNTS);
  if (activeUsers === operationalTeam.length && roleReadyUsers < operationalTeam.length) {
    missing.push(GO_LIVE_REQUIREMENTS.USER_ROLE_PLAN);
  }
  if (!bankReady) missing.push(GO_LIVE_REQUIREMENTS.BANK_ACCOUNT);
  if (openingBalance <= 0) missing.push(GO_LIVE_REQUIREMENTS.OPENING_BANK_BALANCE);
  if (parentCompanies <= 0 || fundingTotal < openingBalance) missing.push(GO_LIVE_REQUIREMENTS.FUNDING_SOURCE);
  if (preopeningAccounts.length <= 0 || Math.abs(preopeningLedgerVariance) > 0.01) {
    missing.push(GO_LIVE_REQUIREMENTS.PREOPENING_LEDGER_RECONCILIATION);
  }
  if (physicalProducts <= 0) missing.push(GO_LIVE_REQUIREMENTS.PRODUCT_CATALOG);
  if (serviceProducts <= 0) missing.push(GO_LIVE_REQUIREMENTS.SERVICE_CATALOG);
  if (openingStockMovements <= 0) missing.push(GO_LIVE_REQUIREMENTS.OPENING_STOCK);
  if (suppliers <= 0) missing.push(GO_LIVE_REQUIREMENTS.SUPPLIERS);
  if (openShifts > 0) missing.push(GO_LIVE_REQUIREMENTS.OPEN_SHIFT);

  return {
    branch,
    ready: missing.length === 0,
    missing,
    summary: {
      employees: employees.length,
      plannedEmployees: operationalTeam.length,
      activeUsers,
      roleReadyUsers,
      bankReady,
      openingBalance,
      fundingTotal,
      preopeningReportedTotal,
      preopeningImportedTotal,
      preopeningLedgerVariance,
      physicalProducts,
      serviceProducts,
      openingStockMovements,
      suppliers,
      openShifts,
    },
  };
}
