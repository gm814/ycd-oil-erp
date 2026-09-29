import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE_APPROVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const expense = await tx.expenseRequest.findFirst({
        where: { id, branchId: session.branchId! },
      });
      if (!expense) throw new Error("EXPENSE_REQUEST_NOT_FOUND");
      if (expense.status !== "REQUESTED") throw new Error("EXPENSE_REQUEST_NOT_PENDING");
      if (expense.requestedBy === session.userId) throw new Error("SELF_APPROVAL_NOT_ALLOWED");

      const approval = await tx.approval.findFirst({
        where: {
          entityType: "ExpenseRequest",
          entityId: expense.id,
          step: "EXPENSE_APPROVAL",
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });
      if (!approval) throw new Error("APPROVAL_NOT_FOUND");

      const approved = parsed.data.decision === "APPROVE";
      const updated = await tx.expenseRequest.update({
        where: { id: expense.id },
        data: approved
          ? {
              status: "APPROVED",
              approvedBy: session.userId,
              approvedAt: new Date(),
              decisionNotes: parsed.data.notes || null,
            }
          : {
              status: "REJECTED",
              rejectedBy: session.userId,
              rejectedAt: new Date(),
              decisionNotes: parsed.data.notes || null,
            },
      });

      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          decidedBy: session.userId,
          decidedAt: new Date(),
          notes: parsed.data.notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: approved ? "OPERATING_EXPENSE_APPROVED" : "OPERATING_EXPENSE_REJECTED",
          entityType: "ExpenseRequest",
          entityId: expense.id,
          afterJson: {
            requestNo: expense.requestNo,
            amount: expense.amount.toString(),
            decision: parsed.data.decision,
            notes: parsed.data.notes || null,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ expenseRequest: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_DECISION_FAILED";
    const status = code === "EXPENSE_REQUEST_NOT_FOUND" || code === "APPROVAL_NOT_FOUND" ? 404
      : code === "SELF_APPROVAL_NOT_ALLOWED" || code === "EXPENSE_REQUEST_NOT_PENDING" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
