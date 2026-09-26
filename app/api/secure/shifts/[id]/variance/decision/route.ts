import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().trim().min(3).max(500),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.SHIFT_VARIANCE_APPROVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const variance = await tx.shiftVarianceResolution.findFirst({
        where: { shiftId: id, branchId: session.branchId! },
      });
      if (!variance) throw new Error("SHIFT_VARIANCE_NOT_FOUND");
      if (variance.status !== "PENDING") throw new Error("SHIFT_VARIANCE_ALREADY_DECIDED");
      if (variance.requestedBy === session.userId) throw new Error("SELF_APPROVAL_NOT_ALLOWED");

      const approval = await tx.approval.findFirst({
        where: {
          entityType: "ShiftVarianceResolution",
          entityId: variance.id,
          step: "SHIFT_VARIANCE_APPROVAL",
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });
      if (!approval) throw new Error("APPROVAL_NOT_FOUND");

      const approved = parsed.data.decision === "APPROVE";
      const updated = await tx.shiftVarianceResolution.update({
        where: { id: variance.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          decidedBy: session.userId,
          decidedAt: new Date(),
          decisionNotes: parsed.data.notes,
        },
      });

      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          decidedBy: session.userId,
          decidedAt: new Date(),
          notes: parsed.data.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: approved ? "SHIFT_VARIANCE_APPROVED" : "SHIFT_VARIANCE_REJECTED",
          entityType: "ShiftVarianceResolution",
          entityId: variance.id,
          afterJson: {
            shiftId: id,
            cashVariance: variance.cashVariance.toString(),
            cardVariance: variance.cardVariance.toString(),
            transferVariance: variance.transferVariance.toString(),
            notes: parsed.data.notes,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ variance: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SHIFT_VARIANCE_DECISION_FAILED";
    const status = ["SHIFT_VARIANCE_NOT_FOUND", "APPROVAL_NOT_FOUND"].includes(code) ? 404
      : ["SHIFT_VARIANCE_ALREADY_DECIDED", "SELF_APPROVAL_NOT_ALLOWED"].includes(code) ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
