import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.PAYROLL_APPROVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const current = await db.payrollPeriod.findUnique({ where: { id } });
  if (!current || current.branchId !== session.branchId) return NextResponse.json({ error: "PAYROLL_NOT_FOUND" }, { status: 404 });
  if (current.status !== "DRAFT") return NextResponse.json({ error: "PAYROLL_NOT_DRAFT" }, { status: 409 });
  if (current.generatedBy === session.userId) return NextResponse.json({ error: "SEPARATE_APPROVER_REQUIRED" }, { status: 409 });

  const period = await db.$transaction(async (tx) => {
    const updated = await tx.payrollPeriod.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: session.userId, approvedAt: new Date() },
    });
    await tx.auditLog.create({
      data: { actorId: session.userId, action: "PAYROLL_APPROVED", entityType: "PayrollPeriod", entityId: id },
    });
    return updated;
  });
  return NextResponse.json({ period });
}
