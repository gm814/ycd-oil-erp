import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  bankName: z.string().trim().min(2).max(120),
  accountNameAr: z.string().trim().max(200).optional(),
  accountNumber: z.string().trim().max(50).optional(),
  iban: z.string().trim().toUpperCase().regex(/^SA\d{22}$/).optional().or(z.literal("")),
  currency: z.string().trim().length(3).default("SAR"),
  notes: z.string().trim().max(500).optional(),
}).refine((value) => Boolean(value.accountNumber || value.iban), {
  message: "ACCOUNT_OR_IBAN_REQUIRED",
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.GROUP_FUNDING_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const bankAccount = await db.$transaction(async (tx) => {
      const company = await tx.groupCompany.findFirst({
        where: {
          id,
          active: true,
          organization: { branches: { some: { id: session.branchId! } } },
        },
      });
      if (!company) throw new Error("GROUP_COMPANY_NOT_FOUND");

      if (parsed.data.iban) {
        const existing = await tx.groupCompanyBankAccount.findUnique({ where: { iban: parsed.data.iban } });
        if (existing) throw new Error("IBAN_ALREADY_REGISTERED");
      }

      const created = await tx.groupCompanyBankAccount.create({
        data: {
          companyId: company.id,
          bankName: parsed.data.bankName,
          accountNameAr: parsed.data.accountNameAr || company.legalNameAr,
          accountNumber: parsed.data.accountNumber || null,
          iban: parsed.data.iban || null,
          currency: parsed.data.currency.toUpperCase(),
          notes: parsed.data.notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "GROUP_COMPANY_BANK_REGISTERED",
          entityType: "GroupCompanyBankAccount",
          entityId: created.id,
          afterJson: {
            companyId: company.id,
            companyNameAr: company.legalNameAr,
            bankName: created.bankName,
            accountNumberLast4: created.accountNumber?.slice(-4) ?? null,
            ibanLast4: created.iban?.slice(-4) ?? null,
            currency: created.currency,
          },
        },
      });

      return created;
    });

    return NextResponse.json({ bankAccount }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GROUP_COMPANY_BANK_CREATE_FAILED";
    const status = code === "GROUP_COMPANY_NOT_FOUND" ? 404
      : code === "IBAN_ALREADY_REGISTERED" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
