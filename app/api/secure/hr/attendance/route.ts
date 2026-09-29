import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  employeeId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["PRESENT", "ABSENT", "LEAVE", "SICK", "OFF"]),
  overtimeMin: z.coerce.number().int().min(0).max(1440).default(0),
  lateMin: z.coerce.number().int().min(0).max(1440).default(0),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.ATTENDANCE_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const employee = await db.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee || employee.branchId !== session.branchId || !employee.active) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const workDate = new Date(parsed.data.workDate + "T00:00:00.000Z");
  const attendance = await db.attendanceRecord.upsert({
    where: { employeeId_workDate: { employeeId: employee.id, workDate } },
    update: {
      status: parsed.data.status,
      overtimeMin: parsed.data.overtimeMin,
      lateMin: parsed.data.lateMin,
      notes: parsed.data.notes || null,
      recordedBy: session.userId,
    },
    create: {
      employeeId: employee.id,
      workDate,
      status: parsed.data.status,
      overtimeMin: parsed.data.overtimeMin,
      lateMin: parsed.data.lateMin,
      notes: parsed.data.notes || null,
      recordedBy: session.userId,
    },
  });
  await db.auditLog.create({
    data: {
      actorId: session.userId,
      action: "ATTENDANCE_RECORDED",
      entityType: "AttendanceRecord",
      entityId: attendance.id,
      afterJson: { employeeId: employee.id, workDate: parsed.data.workDate, status: parsed.data.status },
    },
  });
  return NextResponse.json({ attendance });
}
