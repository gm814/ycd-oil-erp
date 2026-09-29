import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  actualCost: z.coerce.number().min(0).max(10_000_000).default(0),
  completionNotesAr: z.string().trim().min(2).max(1000),
  nextMaintenanceAt: z.string().optional(),
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

  try {
    const order = await db.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findUnique({ where: { id }, include: { asset: true } });
      if (!current || current.asset.branchId !== session.branchId) throw new Error("MAINTENANCE_NOT_FOUND");
      if (current.status === "COMPLETED" || current.status === "CANCELLED") throw new Error("MAINTENANCE_NOT_OPEN");

      const nextMaintenanceAt = parsed.data.nextMaintenanceAt ? new Date(parsed.data.nextMaintenanceAt + "T00:00:00.000Z") : null;
      const updated = await tx.maintenanceWorkOrder.update({
        where: { id },
        data: {
          status: "COMPLETED",
          actualCost: parsed.data.actualCost,
          completionNotesAr: parsed.data.completionNotesAr,
          nextMaintenanceAt,
          completedAt: new Date(),
        },
      });
      await tx.asset.update({
        where: { id: current.assetId },
        data: { status: "ACTIVE", nextMaintenanceAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "MAINTENANCE_COMPLETED",
          entityType: "MaintenanceWorkOrder",
          entityId: id,
          afterJson: { actualCost: String(parsed.data.actualCost), nextMaintenanceAt: parsed.data.nextMaintenanceAt || null },
        },
      });
      return updated;
    });
    return NextResponse.json({ order });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MAINTENANCE_COMPLETE_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
