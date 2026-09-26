import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ notes: z.string().trim().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.SUPPLIER_INVOICE_APPROVE_PAYMENT)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const invoice = await db.$transaction(async (tx) => {
      const current = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!current || current.branchId !== session.branchId) throw new Error("SUPPLIER_INVOICE_NOT_FOUND");
      if (!current.threeWayMatched || current.status !== "MATCHED") throw new Error("THREE_WAY_MATCH_REQUIRED");

      const updated = await tx.supplierInvoice.update({
        where: { id },
        data: {
          status: "APPROVED_FOR_PAYMENT",
          approvedForPaymentAt: new Date(),
          approvedForPaymentBy: session.userId,
        },
      });
      await tx.approval.create({
        data: {
          entityType: "SupplierInvoice",
          entityId: id,
          step: "PAYMENT_APPROVAL",
          requestedBy: current.createdBy,
          decidedBy: session.userId,
          status: "APPROVED",
          notes: parsed.data.notes || null,
          decidedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SUPPLIER_INVOICE_APPROVED_FOR_PAYMENT",
          entityType: "SupplierInvoice",
          entityId: id,
        },
      });
      return updated;
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_APPROVAL_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
