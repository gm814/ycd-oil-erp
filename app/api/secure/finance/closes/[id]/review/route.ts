import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  action: z.enum(["REVIEW", "CLOSE"]),
  notes: z.string().trim().max(500).optional(),
});

function hasVariance(shift: {
  cashVariance: unknown;
  cardVariance: unknown;
  transferVariance: unknown;
  varianceResolution: { status: string } | null;
}) {
  const variance =
    Math.abs(Number(shift.cashVariance ?? 0)) > 0.01 ||
    Math.abs(Number(shift.cardVariance ?? 0)) > 0.01 ||
    Math.abs(Number(shift.transferVariance ?? 0)) > 0.01;
  return variance && shift.varianceResolution?.status !== "APPROVED";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCIAL_CLOSE_REVIEW)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const close = await tx.financialClose.findFirst({ where: { id, branchId: session.branchId! } });
      if (!close) throw new Error("FINANCIAL_CLOSE_NOT_FOUND");
      if (close.preparedBy === session.userId) throw new Error("SELF_REVIEW_NOT_ALLOWED");

      if (parsed.data.action === "REVIEW") {
        if (close.status !== "DRAFT") throw new Error("FINANCIAL_CLOSE_NOT_DRAFT");
        const updated = await tx.financialClose.update({
          where: { id: close.id },
          data: {
            status: "REVIEWED",
            reviewedBy: session.userId,
            reviewedAt: new Date(),
            notes: parsed.data.notes || close.notes,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "FINANCIAL_CLOSE_REVIEWED",
            entityType: "FinancialClose",
            entityId: close.id,
            afterJson: { closeNo: close.closeNo, notes: parsed.data.notes || null },
          },
        });
        return updated;
      }

      if (close.status !== "REVIEWED") throw new Error("FINANCIAL_CLOSE_REVIEW_REQUIRED");

      const [shifts, bankReconciliations] = await Promise.all([
        tx.shift.findMany({
          where: {
            branchId: session.branchId!,
            openedAt: { gte: close.periodStart, lt: close.periodEnd },
          },
          select: {
            closedAt: true,
            cashVariance: true,
            cardVariance: true,
            transferVariance: true,
            varianceResolution: { select: { status: true } },
          },
        }),
        tx.bankReconciliation.findMany({
          where: {
            branchId: session.branchId!,
            statementDate: { gte: close.periodStart, lt: close.periodEnd },
          },
          select: { status: true, difference: true },
        }),
      ]);

      const openShifts = shifts.filter((shift) => !shift.closedAt).length;
      const unresolvedShiftVariances = shifts.filter(hasVariance).length;
      const unresolvedBankReconciliations = bankReconciliations.filter((item) =>
        item.status !== "CLOSED" || Math.abs(Number(item.difference)) > 0.01
      ).length;

      if (openShifts > 0) throw new Error("OPEN_SHIFTS_REMAIN");
      if (unresolvedShiftVariances > 0) throw new Error("SHIFT_VARIANCES_UNRESOLVED");
      if (unresolvedBankReconciliations > 0) throw new Error("BANK_RECONCILIATIONS_UNRESOLVED");

      const updated = await tx.financialClose.update({
        where: { id: close.id },
        data: {
          status: "CLOSED",
          closedBy: session.userId,
          closedAt: new Date(),
          openShifts,
          unresolvedShiftVariances,
          unresolvedBankReconciliations,
          notes: parsed.data.notes || close.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "FINANCIAL_CLOSE_CLOSED",
          entityType: "FinancialClose",
          entityId: close.id,
          afterJson: { closeNo: close.closeNo, notes: parsed.data.notes || null },
        },
      });
      return updated;
    });

    return NextResponse.json({ close: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FINANCIAL_CLOSE_REVIEW_FAILED";
    const status = code === "FINANCIAL_CLOSE_NOT_FOUND" ? 404
      : ["SELF_REVIEW_NOT_ALLOWED", "FINANCIAL_CLOSE_NOT_DRAFT", "FINANCIAL_CLOSE_REVIEW_REQUIRED", "OPEN_SHIFTS_REMAIN", "SHIFT_VARIANCES_UNRESOLVED", "BANK_RECONCILIATIONS_UNRESOLVED"].includes(code)
        ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
