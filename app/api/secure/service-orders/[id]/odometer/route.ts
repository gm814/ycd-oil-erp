import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ odometer: z.number().int().min(0).max(2_000_000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;
  try {
    await db.$transaction(async tx => {
      const order = await tx.serviceOrder.findUnique({ where: { id }, include: { invoice: true } });
      if (!order || order.branchId !== session.branchId) throw new Error("NOT_FOUND");
      if (order.invoice || ["COMPLETED", "CANCELLED"].includes(order.status)) throw new Error("ORDER_LOCKED");
      const previous = await tx.serviceOrder.findFirst({
        where: { vehicleId: order.vehicleId, id: { not: id }, status: "COMPLETED", odometer: { gt: parsed.data.odometer } },
        select: { id: true },
      });
      if (previous) throw new Error("ODOMETER_DECREASE");
      await tx.serviceOrder.update({ where: { id }, data: { odometer: parsed.data.odometer } });
      // Preserve a higher vehicle reading recorded by another visit.
      await tx.vehicle.updateMany({
        where: { id: order.vehicleId, OR: [{ currentOdometer: null }, { currentOdometer: { lt: parsed.data.odometer } }] },
        data: { currentOdometer: parsed.data.odometer },
      });
      await tx.auditLog.create({ data: {
        actorId: session.userId, action: "SERVICE_ORDER_ODOMETER_UPDATED", entityType: "ServiceOrder", entityId: id,
        beforeJson: { odometer: order.odometer }, afterJson: { odometer: parsed.data.odometer },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ odometer: parsed.data.odometer });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: ["NOT_FOUND", "ORDER_LOCKED", "ODOMETER_DECREASE"].includes(code) ? code : "CONCURRENT_CHANGE" }, { status: code === "NOT_FOUND" ? 404 : 409 });
  }
}
