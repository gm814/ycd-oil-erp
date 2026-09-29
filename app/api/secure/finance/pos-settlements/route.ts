import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  posAccountId: z.string().min(1),
  bankAccountId: z.string().min(1),
  grossAmount: z.coerce.number().positive().max(50_000_000),
  feeAmount: z.coerce.number().min(0).max(5_000_000).default(0),
  reference: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(300).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
}).refine((value) => value.feeAmount < value.grossAmount, {
  message: "INVALID_POS_FEE",
  path: ["feeAmount"],
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.POS_SETTLE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const outKey = `pos-settlement-out:${parsed.data.idempotencyReference}`;
      const feeKey = `pos-settlement-fee:${parsed.data.idempotencyReference}`;
      const inKey = `pos-settlement-in:${parsed.data.idempotencyReference}`;
      const [existingOut, existingFee, existingIn] = await Promise.all([
        tx.financialTransaction.findUnique({ where: { idempotencyKey: outKey } }),
        tx.financialTransaction.findUnique({ where: { idempotencyKey: feeKey } }),
        tx.financialTransaction.findUnique({ where: { idempotencyKey: inKey } }),
      ]);

      const gross = new Prisma.Decimal(parsed.data.grossAmount);
      const fee = new Prisma.Decimal(parsed.data.feeAmount);
      const net = gross.minus(fee);
      const shouldHaveFee = fee.greaterThan(0);

      if (existingOut || existingFee || existingIn) {
        const valid =
          existingOut &&
          existingIn &&
          existingOut.accountId === parsed.data.posAccountId &&
          existingIn.accountId === parsed.data.bankAccountId &&
          existingOut.amount.abs().equals(net) &&
          existingIn.amount.equals(net) &&
          (shouldHaveFee
            ? existingFee && existingFee.accountId === parsed.data.posAccountId && existingFee.amount.abs().equals(fee)
            : !existingFee);
        if (!valid) throw new Error("IDEMPOTENCY_CONFLICT");
        return { out: existingOut!, fee: existingFee, incoming: existingIn!, gross, net };
      }

      const [posAccount, bankAccount] = await Promise.all([
        tx.financialAccount.findFirst({
          where: { id: parsed.data.posAccountId, branchId: session.branchId!, active: true, type: "POS_CLEARING" },
        }),
        tx.financialAccount.findFirst({
          where: { id: parsed.data.bankAccountId, branchId: session.branchId!, active: true, type: "BANK" },
        }),
      ]);
      if (!posAccount || !bankAccount) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");

      const balanceResult = await tx.financialTransaction.aggregate({
        where: { accountId: posAccount.id },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? new Prisma.Decimal(0);
      if (balance.lessThan(gross)) throw new Error("INSUFFICIENT_POS_CLEARING_BALANCE");

      const description = parsed.data.notes
        ? `تسوية مدى / شبكة إلى ${bankAccount.nameAr} — ${parsed.data.notes}`
        : `تسوية مدى / شبكة إلى ${bankAccount.nameAr}`;

      const out = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: posAccount.id,
          type: "TRANSFER_OUT",
          amount: net.negated(),
          reference: parsed.data.reference,
          descriptionAr: description,
          relatedEntityType: "PosSettlement",
          relatedEntityId: parsed.data.idempotencyReference,
          performedBy: session.userId,
          idempotencyKey: outKey,
        },
      });

      const feeTransaction = shouldHaveFee
        ? await tx.financialTransaction.create({
            data: {
              branchId: session.branchId!,
              accountId: posAccount.id,
              type: "EXPENSE",
              amount: fee.negated(),
              reference: parsed.data.reference,
              descriptionAr: `رسوم تسوية مدى / شبكة — ${parsed.data.reference}`,
              relatedEntityType: "PosSettlementFee",
              relatedEntityId: parsed.data.idempotencyReference,
              performedBy: session.userId,
              idempotencyKey: feeKey,
            },
          })
        : null;

      const incoming = await tx.financialTransaction.create({
        data: {
          branchId: session.branchId!,
          accountId: bankAccount.id,
          type: "TRANSFER_IN",
          amount: net,
          reference: parsed.data.reference,
          descriptionAr: description,
          relatedEntityType: "PosSettlement",
          relatedEntityId: parsed.data.idempotencyReference,
          performedBy: session.userId,
          idempotencyKey: inKey,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "POS_SETTLEMENT_POSTED",
          entityType: "PosSettlement",
          entityId: parsed.data.idempotencyReference,
          afterJson: {
            posAccountId: posAccount.id,
            bankAccountId: bankAccount.id,
            grossAmount: gross.toString(),
            feeAmount: fee.toString(),
            netAmount: net.toString(),
            reference: parsed.data.reference,
          },
        },
      });

      return { out, fee: feeTransaction, incoming, gross, net };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({
      settlement: {
        grossAmount: result.gross.toString(),
        netAmount: result.net.toString(),
        outgoingTransactionId: result.out.id,
        feeTransactionId: result.fee?.id ?? null,
        incomingTransactionId: result.incoming.id,
      },
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "POS_SETTLEMENT_FAILED";
    const status = code === "INSUFFICIENT_POS_CLEARING_BALANCE" || code === "IDEMPOTENCY_CONFLICT"
      ? 409 : code === "FINANCIAL_ACCOUNT_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
