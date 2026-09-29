import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: z.enum(["EARNING", "DEDUCTION"]),
  amount: z.coerce.number().positive().max(1_000_000),
  reason: z.string().trim().min(2).max(300),
  reference: z.string().trim().max(120).optional(),
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

  const employee = await db.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee || employee.branchId !== session.branchId || !employee.active) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const adjustment = await db.payrollAdjustment.create({
    data: {
      employeeId: employee.id,
      year: parsed.data.year,
      month: parsed.data.month,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      reference: parsed.data.reference || null,
      createdBy: session.userId,
    },
  });
  await db.auditLog.create({
    data: {
      actorId: session.userId,
      action: "PAYROLL_ADJUSTMENT_CREATED",
      entityType: "PayrollAdjustment",
      entityId: adjustment.id,
      afterJson: { employeeId: employee.id, type: adjustment.type, amount: adjustment.amount.toString(), reason: adjustment.reason },
    },
  });
  return NextResponse.json({ adjustment }, { status: 201 });
}
