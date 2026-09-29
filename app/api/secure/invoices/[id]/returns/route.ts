import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { processSalesReturn } from "@/services/sales-return";

const schema = z.object({
  reason: z.string().trim().min(5).max(500),
  refundMethod: z.enum(["CASH", "CARD", "TRANSFER"]).optional(),
  refundReference: z.string().trim().max(120).optional(),
  idempotencyReference: z.string().trim().min(12).max(120),
  items: z.array(z.object({
    serviceOrderItemId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100000),
  })).min(1).max(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.SALES_RETURN_PROCESS)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  try {
    const salesReturn = await processSalesReturn({
      invoiceId: id,
      branchId: session.branchId,
      actorId: session.userId,
      ...parsed.data,
    });
    return NextResponse.json({ salesReturn }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_RETURN_FAILED";
    const status = code.endsWith("_NOT_FOUND") ? 404
      : ["RETURN_QUANTITY_EXCEEDED", "DUPLICATE_RETURN_ITEM", "INSUFFICIENT_FINANCIAL_BALANCE"].includes(code) ? 409
      : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
