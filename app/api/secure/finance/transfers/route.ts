import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  amount: z.coerce.number().positive().max(50_000_000),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
}).refine((value) => value.sourceAccountId !== value.destinationAccountId, {
  message: "SAME_ACCOUNT",
  path: ["destinationAccountId"],
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_TRANSFER)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const outKey = `transfer-out:${parsed.data.idempotencyReference}`;
      const inKey = `transfer-in:${parsed.data.idempotencyReference}`;
      const [existingOut, existingIn] = await Promise.all([
        tx.financialTransaction.findUnique({ where: { idempotencyKey: outKey } }),
        tx.financialTransaction.findUnique({ where: { idempotencyKey: inKey } }),
      ]);

      const amount = new Prisma.Decimal(parsed.data.amount);
      if (existingOut || existingIn) {
        if (
          !existingOut || !existingIn ||
          existingOut.accountId !== parsed.data.sourceAccountId ||
          existingIn.accountId !== parsed.data.destinationAccountId ||
          !existingOut.amount.abs().equals(amount) ||
          !existingIn.amount.equals(amount)
        ) throw new Error("IDEMPOTENCY_CONFLICT");
        return { out: existingOut, incoming: existingIn };
      }

      const [source, destination] = await Promise.all([
        tx.financialAccount.findFirst({
          where: {
            id: parsed.data.sourceAccountId,
            branchId: session.branchId!,
            active: true,
            type: { in: ["CASH", "BANK"] },
          },
        }),
        tx.financialAccount.findFirst({
          where: {
            id: parsed.data.destinationAccountId,
            branchId: session.branchId!,
            active: true,
            type: { in: ["CASH", "BANK"] },
          },
        }),
      ]);
      if (!source || !destination) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
      if (source.id === destination.id) throw new Error("SAME_ACCOUNT");

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: source.id },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(amount)) throw new Error("INSUFFICIENT_FINANCIAL_BALANCE");

      const description = parsed.data.notes
        ? `تحويل من ${source.nameAr} إلى ${destination.nameAr} — ${parsed.data.notes}`
        : `تحويل من ${source.nameAr} إلى ${destination.nameAr}`;

      const out = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: source.id,
          type: "TRANSFER_OUT",
          amount: amount.negated(),
          reference: parsed.data.reference || parsed.data.idempotencyReference,
          descriptionAr: description,
          relatedEntityType: "FinancialTransfer",
          relatedEntityId: parsed.data.idempotencyReference,
          performedBy: session.userId,
          idempotencyKey: outKey,
        },
      });
      const incoming = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: destination.id,
          type: "TRANSFER_IN",
          amount,
          reference: parsed.data.reference || parsed.data.idempotencyReference,
          descriptionAr: description,
          relatedEntityType: "FinancialTransfer",
          relatedEntityId: parsed.data.idempotencyReference,
          performedBy: session.userId,
          idempotencyKey: inKey,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "FINANCIAL_TRANSFER_POSTED",
          entityType: "FinancialTransfer",
          entityId: parsed.data.idempotencyReference,
          afterJson: {
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            amount: amount.toString(),
            reference: parsed.data.reference || null,
          },
        },
      });

      return { out, incoming };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FINANCIAL_TRANSFER_FAILED";
    const status = code === "INSUFFICIENT_FINANCIAL_BALANCE" || code === "IDEMPOTENCY_CONFLICT" || code === "SAME_ACCOUNT"
      ? 409 : code === "FINANCIAL_ACCOUNT_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
