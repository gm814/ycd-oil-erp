import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ notes: z.string().trim().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_APPROVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { id } = await params;
  try {
    const purchaseRequest = await db.$transaction(async (tx) => {
      const current = await tx.purchaseRequest.findUnique({
        where: { id },
        include: { quotes: true },
      });
      if (!current || current.branchId !== session.branchId) throw new Error("PURCHASE_REQUEST_NOT_FOUND");
      if (current.status !== "PENDING_APPROVAL") throw new Error("PURCHASE_REQUEST_NOT_PENDING");
      if (current.quotes.length === 0) throw new Error("SUPPLIER_QUOTE_REQUIRED");

      const updated = await tx.purchaseRequest.update({
        where: { id },
        data: { status: "APPROVED" },
      });
      await tx.approval.create({
        data: {
          entityType: "PurchaseRequest",
          entityId: id,
          step: "PURCHASE_REQUEST_APPROVAL",
          requestedBy: current.requestedBy,
          decidedBy: session.userId,
          status: "APPROVED",
          notes: parsed.data.notes || null,
          decidedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "PURCHASE_REQUEST_APPROVED",
          entityType: "PurchaseRequest",
          entityId: id,
        },
      });
      return updated;
    });
    return NextResponse.json({ purchaseRequest });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PURCHASE_REQUEST_APPROVE_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
