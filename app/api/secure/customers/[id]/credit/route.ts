import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  creditAllowed: z.boolean(),
  creditLimit: z.coerce.number().min(0).max(100_000_000),
  creditDays: z.coerce.number().int().min(0).max(365),
}).superRefine((data, ctx) => {
  if (data.creditAllowed && data.creditLimit <= 0) {
    ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "CREDIT_LIMIT_REQUIRED" });
  }
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.CREDIT_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, serviceOrders: { some: { branchId: session.branchId } } },
    select: { id: true, creditAllowed: true, creditLimit: true, creditDays: true },
  });
  if (!customer) return NextResponse.json({ error: "CUSTOMER_NOT_FOUND" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.customer.update({
      where: { id: customer.id },
      data: {
        creditAllowed: parsed.data.creditAllowed,
        creditLimit: parsed.data.creditAllowed ? parsed.data.creditLimit : 0,
        creditDays: parsed.data.creditAllowed ? parsed.data.creditDays : 0,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "CUSTOMER_CREDIT_TERMS_UPDATED",
        entityType: "Customer",
        entityId: customer.id,
        beforeJson: {
          creditAllowed: customer.creditAllowed,
          creditLimit: customer.creditLimit.toString(),
          creditDays: customer.creditDays,
        },
        afterJson: {
          creditAllowed: result.creditAllowed,
          creditLimit: result.creditLimit.toString(),
          creditDays: result.creditDays,
        },
      },
    });
    return result;
  });

  return NextResponse.json({ customer: updated });
}
