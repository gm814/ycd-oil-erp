import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { completeServiceOrder } from "@/services/service-order";

const schema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]),
  paymentReference: z.string().trim().max(120).optional(),
  nextServiceKm: z.number().int().min(0).max(3_000_000).optional(),
  nextServiceAt: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });

  const required = [
    PERMISSIONS.INVENTORY_ISSUE,
    PERMISSIONS.INVOICE_ISSUE,
    PERMISSIONS.PAYMENT_RECEIVE,
  ];
  if (!required.every((permission) => hasPermission(session.permissions, permission))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;

  try {
    const invoice = await completeServiceOrder({
      serviceOrderId: id,
      actorId: session.userId,
      branchId: session.branchId,
      paymentMethod: parsed.data.paymentMethod,
      paymentReference: parsed.data.paymentReference,
      nextServiceKm: parsed.data.nextServiceKm,
      nextServiceAt: parsed.data.nextServiceAt
        ? new Date(`${parsed.data.nextServiceAt}T00:00:00+03:00`)
        : undefined,
      idempotencyReference: parsed.data.idempotencyReference,
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = code === "INSUFFICIENT_STOCK" ? 409 : code.endsWith("_NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
