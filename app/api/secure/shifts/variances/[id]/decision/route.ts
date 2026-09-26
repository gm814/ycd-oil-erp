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
    const resolution = await db.$transaction(async (tx) => {
      const current = await tx.shiftVarianceResolution.findFirst({
        where: { id, branchId: session.branchId! },
        include: { shift: true },
      });
      if (!current) throw new Error("SHIFT_VARIANCE_NOT_FOUND");
      if (current.status !== "PENDING") throw new Error("SHIFT_VARIANCE_ALREADY_DECIDED");
      if (current.requestedBy === session.userId) throw new Error("SELF_APPROVAL_NOT_ALLOWED");

      const approved = parsed.data.decision === "APPROVE";
      const updated = await tx.shiftVarianceResolution.update({
        where: { id: current.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          decidedBy: session.userId,
          decisionNotes: parsed.data.notes,
          decidedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: approved ? "SHIFT_VARIANCE_APPROVED" : "SHIFT_VARIANCE_REJECTED",
          entityType: "ShiftVarianceResolution",
          entityId: current.id,
          afterJson: {
            shiftId: current.shiftId,
            cashVariance: current.cashVariance.toString(),
            cardVariance: current.cardVariance.toString(),
            transferVariance: current.transferVariance.toString(),
            notes: parsed.data.notes,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ resolution });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SHIFT_VARIANCE_DECISION_FAILED";
    const status = code === "SHIFT_VARIANCE_NOT_FOUND" ? 404
      : ["SHIFT_VARIANCE_ALREADY_DECIDED", "SELF_APPROVAL_NOT_ALLOWED"].includes(code) ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
