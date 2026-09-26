import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  accountId: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  category: z.enum(["RENT", "UTILITIES", "FUEL", "MAINTENANCE", "SUPPLIES", "ADMIN", "OTHER"]),
  descriptionAr: z.string().trim().min(3).max(300),
  recipientName: z.string().trim().max(160).optional(),
  recipientPhone: z.string().trim().max(30).optional(),
  reference: z.string().trim().max(120).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_EXPENSE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const requestNo = `EXP-${parsed.data.idempotencyReference}`;
    const existing = await db.expenseRequest.findUnique({ where: { requestNo } });
    if (existing) {
      if (
        existing.branchId !== session.branchId ||
        existing.accountId !== parsed.data.accountId ||
        Number(existing.amount) !== parsed.data.amount
      ) return NextResponse.json({ error: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
      return NextResponse.json({ expenseRequest: existing }, { status: 200 });
    }

    const account = await db.financialAccount.findFirst({
      where: {
        id: parsed.data.accountId,
        branchId: session.branchId,
        active: true,
        type: { in: ["CASH", "BANK"] },
      },
    });
    if (!account) return NextResponse.json({ error: "FINANCIAL_ACCOUNT_NOT_FOUND" }, { status: 404 });

    const expenseRequest = await db.$transaction(async (tx) => {
      const created = await tx.expenseRequest.create({
        data: {
          requestNo,
          branchId: session.branchId!,
          accountId: account.id,
          category: parsed.data.category,
          descriptionAr: parsed.data.descriptionAr,
          amount: parsed.data.amount,
          recipientName: parsed.data.recipientName || null,
          recipientPhone: parsed.data.recipientPhone || null,
          reference: parsed.data.reference || null,
          requestedBy: session.userId,
        },
      });

      await tx.approval.create({
        data: {
          entityType: "ExpenseRequest",
          entityId: created.id,
          step: "EXPENSE_APPROVAL",
          requestedBy: session.userId,
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "OPERATING_EXPENSE_REQUESTED",
          entityType: "ExpenseRequest",
          entityId: created.id,
          afterJson: {
            requestNo: created.requestNo,
            accountId: account.id,
            amount: created.amount.toString(),
            category: created.category,
            recipientName: created.recipientName,
            reference: created.reference,
          },
        },
      });

      return created;
    });

    return NextResponse.json({ expenseRequest }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_REQUEST_FAILED";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
