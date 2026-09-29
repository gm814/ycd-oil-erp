import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  employeeId: z.string().optional(),
  custodianName: z.string().trim().min(2).max(160),
  custodianPhone: z.string().trim().max(30).optional(),
  purpose: z.string().trim().min(3).max(500),
  requestedAmount: z.coerce.number().positive().max(1_000_000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTODY_REQUEST)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  if (parsed.data.employeeId) {
    const employee = await db.employee.findUnique({ where: { id: parsed.data.employeeId } });
    if (!employee || employee.branchId !== session.branchId || !employee.active) {
      return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
    }
  }

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const custodyNo = `CST-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const custody = await db.$transaction(async (tx) => {
    const created = await tx.custodyRequest.create({
      data: {
        custodyNo,
        branchId: session.branchId!,
        employeeId: parsed.data.employeeId || null,
        custodianName: parsed.data.custodianName,
        custodianPhone: parsed.data.custodianPhone || null,
        purpose: parsed.data.purpose,
        requestedAmount: parsed.data.requestedAmount,
        requestedBy: session.userId,
        status: "REQUESTED",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "CUSTODY_REQUEST_CREATED",
        entityType: "CustodyRequest",
        entityId: created.id,
        afterJson: { custodyNo, amount: String(parsed.data.requestedAmount), custodianName: parsed.data.custodianName },
      },
    });
    return created;
  });

  return NextResponse.json({ custody }, { status: 201 });
}
