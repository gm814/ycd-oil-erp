import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  action: z.enum(["REVIEW", "CLOSE"]),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.BANK_RECONCILE_REVIEW)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const reconciliation = await db.$transaction(async (tx) => {
      const current = await tx.bankReconciliation.findFirst({
        where: { id, branchId: session.branchId! },
      });
      if (!current) throw new Error("RECONCILIATION_NOT_FOUND");
      if (current.preparedBy === session.userId) throw new Error("SELF_REVIEW_NOT_ALLOWED");

      if (parsed.data.action === "REVIEW") {
        if (current.status !== "DRAFT") throw new Error("RECONCILIATION_NOT_DRAFT");
        if (current.difference.abs().greaterThan("0.01")) throw new Error("RECONCILIATION_DIFFERENCE_REMAINS");
        const updated = await tx.bankReconciliation.update({
          where: { id: current.id },
          data: {
            status: "REVIEWED",
            reviewedBy: session.userId,
            reviewedAt: new Date(),
            notes: parsed.data.notes || current.notes,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "BANK_RECONCILIATION_REVIEWED",
            entityType: "BankReconciliation",
            entityId: current.id,
            afterJson: { difference: current.difference.toString(), notes: parsed.data.notes || null },
          },
        });
        return updated;
      }

      if (current.status !== "REVIEWED") throw new Error("RECONCILIATION_REVIEW_REQUIRED");
      if (current.difference.abs().greaterThan("0.01")) throw new Error("RECONCILIATION_DIFFERENCE_REMAINS");

      const updated = await tx.bankReconciliation.update({
        where: { id: current.id },
        data: {
          status: "CLOSED",
          closedBy: session.userId,
          closedAt: new Date(),
          notes: parsed.data.notes || current.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "BANK_RECONCILIATION_CLOSED",
          entityType: "BankReconciliation",
          entityId: current.id,
          afterJson: { difference: current.difference.toString(), notes: parsed.data.notes || null },
        },
      });
      return updated;
    });

    return NextResponse.json({ reconciliation });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECONCILIATION_REVIEW_FAILED";
    const status = code === "RECONCILIATION_NOT_FOUND" ? 404
      : ["SELF_REVIEW_NOT_ALLOWED", "RECONCILIATION_NOT_DRAFT", "RECONCILIATION_REVIEW_REQUIRED", "RECONCILIATION_DIFFERENCE_REMAINS"].includes(code)
        ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
