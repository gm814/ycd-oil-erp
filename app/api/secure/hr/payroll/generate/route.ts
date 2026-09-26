import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PAYROLL_PREPARE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const existing = await db.payrollPeriod.findUnique({
    where: { branchId_year_month: { branchId: session.branchId, year: parsed.data.year, month: parsed.data.month } },
  });
  if (existing) return NextResponse.json({ error: "PAYROLL_PERIOD_EXISTS", payrollPeriodId: existing.id }, { status: 409 });

  const start = new Date(Date.UTC(parsed.data.year, parsed.data.month - 1, 1));
  const end = new Date(Date.UTC(parsed.data.year, parsed.data.month, 1));
  const employees = await db.employee.findMany({
    where: { branchId: session.branchId, active: true },
    include: {
      attendanceRecords: { where: { workDate: { gte: start, lt: end } } },
      payrollAdjustments: { where: { year: parsed.data.year, month: parsed.data.month } },
    },
    orderBy: { code: "asc" },
  });
  if (employees.length === 0) return NextResponse.json({ error: "NO_ACTIVE_EMPLOYEES" }, { status: 409 });

  const period = await db.$transaction(async (tx) => {
    const created = await tx.payrollPeriod.create({
      data: { branchId: session.branchId!, year: parsed.data.year, month: parsed.data.month, generatedBy: session.userId },
    });

    for (const employee of employees) {
      const earnings = employee.payrollAdjustments
        .filter((item) => item.type === "EARNING")
        .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const deductions = employee.payrollAdjustments
        .filter((item) => item.type === "DEDUCTION")
        .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const net = employee.baseSalary
        .plus(employee.housingAllowance)
        .plus(employee.transportAllowance)
        .plus(earnings)
        .minus(deductions);
      if (net.lessThan(0)) throw new Error("NEGATIVE_NET_SALARY");

      await tx.payrollLine.create({
        data: {
          payrollPeriodId: created.id,
          employeeId: employee.id,
          baseSalary: employee.baseSalary,
          housingAllowance: employee.housingAllowance,
          transportAllowance: employee.transportAllowance,
          otherEarnings: earnings,
          deductions,
          netSalary: net,
          attendanceDays: employee.attendanceRecords.filter((item) => item.status === "PRESENT").length,
          absentDays: employee.attendanceRecords.filter((item) => item.status === "ABSENT").length,
          overtimeMin: employee.attendanceRecords.reduce((sum, item) => sum + item.overtimeMin, 0),
          lateMin: employee.attendanceRecords.reduce((sum, item) => sum + item.lateMin, 0),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "PAYROLL_PERIOD_GENERATED",
        entityType: "PayrollPeriod",
        entityId: created.id,
        afterJson: { year: parsed.data.year, month: parsed.data.month, employeeCount: employees.length },
      },
    });
    return created;
  });

  return NextResponse.json({ period }, { status: 201 });
}
