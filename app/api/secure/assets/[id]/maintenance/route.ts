import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE", "INSPECTION"]),
  issueAr: z.string().trim().min(3).max(500),
  assignedTo: z.string().trim().max(160).optional(),
  estimatedCost: z.coerce.number().min(0).max(10_000_000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.MAINTENANCE_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset || asset.branchId !== session.branchId) return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
  if (asset.status === "DISPOSED") return NextResponse.json({ error: "ASSET_DISPOSED" }, { status: 409 });

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const workOrderNo = `MWO-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const order = await db.$transaction(async (tx) => {
    const created = await tx.maintenanceWorkOrder.create({
      data: {
        workOrderNo,
        assetId: asset.id,
        type: parsed.data.type,
        issueAr: parsed.data.issueAr,
        assignedTo: parsed.data.assignedTo || null,
        estimatedCost: parsed.data.estimatedCost ?? null,
        openedBy: session.userId,
      },
    });
    await tx.asset.update({ where: { id: asset.id }, data: { status: "MAINTENANCE" } });
    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "MAINTENANCE_WORK_ORDER_OPENED",
        entityType: "MaintenanceWorkOrder",
        entityId: created.id,
        afterJson: { workOrderNo, assetId: asset.id, type: parsed.data.type, issueAr: parsed.data.issueAr },
      },
    });
    return created;
  });
  return NextResponse.json({ order }, { status: 201 });
}
