import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { operationalTeam } from "@/lib/operations";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.OPERATIONS_GO_LIVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

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
    openShifts,
  ] = await Promise.all([
    db.branch.findUnique({ where: { id: session.branchId } }),
    db.employee.findMany({
      where: { branchId: session.branchId, active: true },
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
      where: { branchId: session.branchId, active: true, type: "BANK" },
      select: { bankName: true, accountNumber: true, iban: true },
    }),
    db.financialTransaction.aggregate({
      where: { branchId: session.branchId, type: "OPENING_BALANCE", account: { type: "BANK" } },
      _sum: { amount: true },
    }),
    db.groupCompany.count({
      where: {
        organization: { branches: { some: { id: session.branchId } } },
        relationType: "PARENT",
        active: true,
      },
    }),
    db.groupFunding.aggregate({
      where: { branchId: session.branchId },
      _sum: { amount: true },
    }),
    db.product.count({ where: { active: true, category: "SERVICE" } }),
    db.product.count({ where: { active: true, category: { not: "SERVICE" } } }),
    db.stockMovement.count({ where: { branchId: session.branchId, quantity: { gt: 0 } } }),
    db.supplier.count({ where: { active: true } }),
    db.shift.count({ where: { branchId: session.branchId, closedAt: null } }),
  ]);

  if (!branch) return NextResponse.json({ error: "BRANCH_NOT_FOUND" }, { status: 404 });
  if (branch.operationalStatus === "LIVE") {
    return NextResponse.json({ branch, alreadyLive: true });
  }
  if (branch.operationalStatus === "SUSPENDED") {
    return NextResponse.json({ error: "BRANCH_SUSPENDED" }, { status: 423 });
  }

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

  const missing: string[] = [];
  if (employees.length < operationalTeam.length) missing.push("EMPLOYEES");
  if (activeUsers < operationalTeam.length) missing.push("USER_ACCOUNTS");
  if (activeUsers === operationalTeam.length && roleReadyUsers < operationalTeam.length) missing.push("USER_ROLE_PLAN");
  if (!bankReady) missing.push("BANK_ACCOUNT");
  if (openingBalance <= 0) missing.push("OPENING_BANK_BALANCE");
  if (parentCompanies <= 0 || fundingTotal < openingBalance) missing.push("FUNDING_SOURCE");
  if (physicalProducts <= 0) missing.push("PRODUCT_CATALOG");
  if (serviceProducts <= 0) missing.push("SERVICE_CATALOG");
  if (openingStockMovements <= 0) missing.push("OPENING_STOCK");
  if (suppliers <= 0) missing.push("SUPPLIERS");
  if (openShifts > 0) missing.push("OPEN_SHIFT");

  if (missing.length > 0) {
    return NextResponse.json({
      error: "GO_LIVE_REQUIREMENTS_INCOMPLETE",
      missing,
      summary: {
        employees: employees.length,
        activeUsers,
        roleReadyUsers,
        openingBalance,
        fundingTotal,
        physicalProducts,
        serviceProducts,
        openingStockMovements,
        suppliers,
      },
    }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx) => {
    const live = await tx.branch.update({
      where: { id: session.branchId! },
      data: {
        operationalStatus: "LIVE",
        goLiveAt: new Date(),
        goLiveBy: session.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "BRANCH_GO_LIVE",
        entityType: "Branch",
        entityId: live.id,
        beforeJson: { operationalStatus: "PREOPENING" },
        afterJson: {
          operationalStatus: "LIVE",
          goLiveAt: live.goLiveAt?.toISOString() ?? null,
          readiness: {
            employees: employees.length,
            activeUsers,
            roleReadyUsers,
            openingBalance,
            fundingTotal,
            physicalProducts,
            serviceProducts,
            openingStockMovements,
            suppliers,
          },
        },
      },
    });

    return live;
  });

  return NextResponse.json({ branch: updated });
}
