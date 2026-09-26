import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  code: z.string().trim().min(2).max(30),
  nameAr: z.string().trim().min(2).max(160),
  type: z.enum(["CASH", "BANK", "POS_CLEARING"]),
  bankName: z.string().trim().max(120).optional(),
  iban: z.string().trim().max(40).optional(),
  openingBalance: z.coerce.number().min(0).max(100_000_000).default(0),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.FINANCE_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const account = await db.$transaction(async (tx) => {
      const created = await tx.financialAccount.create({
        data: {
          branchId: session.branchId!,
          code: parsed.data.code.toUpperCase(),
          nameAr: parsed.data.nameAr,
          type: parsed.data.type,
          bankName: parsed.data.bankName || null,
          iban: parsed.data.iban || null,
        },
      });
      if (parsed.data.openingBalance > 0) {
        await tx.financialTransaction.create({
          data: {
            branchId: session.branchId!,
            accountId: created.id,
            type: "OPENING_BALANCE",
            amount: parsed.data.openingBalance,
            descriptionAr: "رصيد افتتاحي",
            performedBy: session.userId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "FINANCIAL_ACCOUNT_CREATED",
          entityType: "FinancialAccount",
          entityId: created.id,
          afterJson: { code: created.code, type: created.type, openingBalance: String(parsed.data.openingBalance) },
        },
      });
      return created;
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "FINANCIAL_ACCOUNT_CREATE_FAILED" }, { status: 409 });
  }
}
