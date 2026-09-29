import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  expenseAmount: z.coerce.number().min(0).max(1_000_000),
  returnedAmount: z.coerce.number().min(0).max(1_000_000),
  documentReference: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.expenseAmount + value.returnedAmount <= 0) {
    ctx.addIssue({ code: "custom", message: "Settlement amount is required" });
  }
  if (value.expenseAmount > 0 && !value.documentReference) {
    ctx.addIssue({ code: "custom", message: "Expense evidence reference is required" });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTODY_SETTLE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SETTLEMENT" }, { status: 400 });

  const { id } = await params;
  try {
    const settlement = await db.$transaction(async (tx) => {
      const current = await tx.custodyRequest.findUnique({
        where: { id },
        include: { settlements: true },
      });
      if (!current || current.branchId !== session.branchId) throw new Error("CUSTODY_NOT_FOUND");
      if (!["DISBURSED", "PARTIALLY_SETTLED"].includes(current.status) || !current.approvedAmount) {
        throw new Error("CUSTODY_NOT_SETTLEABLE");
      }

      const prior = current.settlements.reduce(
        (sum, item) => sum.plus(item.expenseAmount).plus(item.returnedAmount),
        new Prisma.Decimal(0),
      );
      const expense = new Prisma.Decimal(parsed.data.expenseAmount);
      const returned = new Prisma.Decimal(parsed.data.returnedAmount);
      const newTotal = prior.plus(expense).plus(returned);
      if (newTotal.greaterThan(current.approvedAmount)) throw new Error("SETTLEMENT_EXCEEDS_CUSTODY");

      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const settlementNo = `CST-SET-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await tx.custodySettlement.create({
        data: {
          settlementNo,
          custodyRequestId: current.id,
          expenseAmount: expense,
          returnedAmount: returned,
          documentReference: parsed.data.documentReference || null,
          notes: parsed.data.notes || null,
          createdBy: session.userId,
        },
      });

      if (returned.greaterThan(0)) {
        if (!current.sourceAccountId) throw new Error("CUSTODY_SOURCE_ACCOUNT_MISSING");
        await tx.financialTransaction.create({
          data: {
            branchId: current.branchId,
            accountId: current.sourceAccountId,
            type: "CUSTODY_SETTLEMENT",
            amount: returned,
            reference: settlementNo,
            descriptionAr: `استرداد متبقي عهدة ${current.custodyNo}`,
            recipientName: current.custodianName,
            recipientPhone: current.custodianPhone,
            relatedEntityType: "CustodyRequest",
            relatedEntityId: current.id,
            performedBy: session.userId,
          },
        });
      }

      const fullySettled = newTotal.equals(current.approvedAmount);
      await tx.custodyRequest.update({
        where: { id: current.id },
        data: { status: fullySettled ? "SETTLED" : "PARTIALLY_SETTLED" },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: fullySettled ? "CUSTODY_FULLY_SETTLED" : "CUSTODY_PARTIALLY_SETTLED",
          entityType: "CustodyRequest",
          entityId: current.id,
          afterJson: {
            settlementNo,
            expenseAmount: expense.toString(),
            returnedAmount: returned.toString(),
            cumulativeSettled: newTotal.toString(),
          },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTODY_SETTLEMENT_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
