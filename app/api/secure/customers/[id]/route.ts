import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { normalizeCustomerPhone, isCustomerPhone } from "@/lib/customer-phone";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().refine(isCustomerPhone).transform(normalizeCustomerPhone),
  previousName: z.string(),
  previousPhone: z.string().nullable(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (![PERMISSIONS.CUSTOMER_VIEW, PERMISSIONS.SERVICE_ORDER_CREATE].every(p => hasPermission(session.permissions, p))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.some(i => i.path[0] === "phone") ? "INVALID_CUSTOMER_PHONE" : "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;
  const { name, phone, previousName, previousPhone } = parsed.data;
  try {
    await db.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { id, serviceOrders: { some: { branchId: session.branchId! } } }, select: { id: true, name: true, phone: true } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const result = await tx.customer.updateMany({ where: { id, name: previousName, phone: previousPhone }, data: { name, phone } });
      if (result.count !== 1) throw new Error("STALE_CUSTOMER");
      await tx.auditLog.create({ data: { actorId: session.userId, action: "CUSTOMER_DETAILS_UPDATED", entityType: "Customer", entityId: id, beforeJson: { name: previousName, phone: previousPhone }, afterJson: { name, phone } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CUSTOMER_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code === "STALE_CUSTOMER") return NextResponse.json({ error: code }, { status: 409 });
    return NextResponse.json({ error: "CUSTOMER_UPDATE_FAILED" }, { status: 500 });
  }
}
