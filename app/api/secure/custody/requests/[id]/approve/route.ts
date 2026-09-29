import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  approvedAmount: z.coerce.number().positive().max(1_000_000),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTODY_APPROVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  const current = await db.custodyRequest.findUnique({ where: { id } });
  if (!current || current.branchId !== session.branchId) {
    return NextResponse.json({ error: "CUSTODY_NOT_FOUND" }, { status: 404 });
  }
  if (current.status !== "REQUESTED") {
    return NextResponse.json({ error: "CUSTODY_NOT_PENDING" }, { status: 409 });
  }
  if (current.requestedBy === session.userId) {
    return NextResponse.json({ error: "SEPARATE_APPROVER_REQUIRED" }, { status: 409 });
  }
  if (parsed.data.approvedAmount > Number(current.requestedAmount)) {
    return NextResponse.json({ error: "APPROVED_AMOUNT_EXCEEDS_REQUEST" }, { status: 409 });
  }

  const custody = await db.$transaction(async (tx) => {
    const updated = await tx.custodyRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAmount: parsed.data.approvedAmount,
        approvedBy: session.userId,
        approvedAt: new Date(),
      },
    });
    await tx.approval.create({
      data: {
        entityType: "CustodyRequest",
        entityId: id,
        step: "CUSTODY_APPROVAL",
        requestedBy: current.requestedBy,
        decidedBy: session.userId,
        status: "APPROVED",
        notes: parsed.data.notes || null,
        decidedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "CUSTODY_APPROVED",
        entityType: "CustodyRequest",
        entityId: id,
        afterJson: { approvedAmount: String(parsed.data.approvedAmount) },
      },
    });
    return updated;
  });

  return NextResponse.json({ custody });
}
