import { nextDocumentNumber } from "@/lib/document-number";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const intakeSchema = z.object({
  channel: z.enum(["OIL", "WASH"]).default("OIL"),
  customerId: z.string().min(1).max(100).optional(),
  vehicleId: z.string().min(1).max(100).optional(),
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20).optional().or(z.literal("")),
  plate: z.string().trim().min(2).max(30),
  make: z.string().trim().max(60).optional().or(z.literal("")),
  model: z.string().trim().max(60).optional().or(z.literal("")),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  odometer: z.coerce.number().int().min(0).max(2_000_000).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });

  const parsed = intakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const normalizedPlate = data.plate.replace(/\s+/g, " ").toUpperCase();

  try {
    const order = await db.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { branchId: session.branchId!, closedAt: null },
        orderBy: { openedAt: "desc" },
      });
      if (!shift) throw new Error("OPEN_SHIFT_REQUIRED");

      // Reuse branch-visible vehicle/customer records; intake must not silently transfer ownership.
      let vehicle = await tx.vehicle.findFirst({ where: { ...(data.vehicleId ? { id: data.vehicleId } : { plate: normalizedPlate }), serviceOrders: { some: { branchId: session.branchId! } } }, include: { customer: true } });
      if (data.vehicleId && (!vehicle || vehicle.plate !== normalizedPlate)) throw new Error("VEHICLE_SELECTION_MISMATCH");
      let customer = vehicle?.customer ?? (data.customerId
        ? await tx.customer.findFirst({ where: { id: data.customerId, serviceOrders: { some: { branchId: session.branchId! } } } })
        : data.phone ? await tx.customer.findFirst({ where: { phone: data.phone, serviceOrders: { some: { branchId: session.branchId! } } } }) : null);
      if (vehicle && data.phone && customer?.phone && data.phone !== customer.phone) throw new Error("CUSTOMER_SELECTION_MISMATCH");
      if (data.customerId && (!customer || customer.id !== data.customerId)) throw new Error("CUSTOMER_SELECTION_MISMATCH");
      if (!customer) customer = await tx.customer.create({ data: { customerNo: `CUST-${crypto.randomUUID().slice(0, 12).toUpperCase()}`, name: data.customerName, phone: data.phone || null } });
      if (vehicle && data.odometer !== undefined && vehicle.currentOdometer !== null && data.odometer < vehicle.currentOdometer) throw new Error("ODOMETER_DECREASE");
      if (!vehicle) {
        vehicle = await tx.vehicle.create({ data: { customerId: customer.id, plate: normalizedPlate, make: data.make || null, model: data.model || null, year: data.year, currentOdometer: data.odometer }, include: { customer: true } });
      } else {
        vehicle = await tx.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometer: data.odometer ?? vehicle.currentOdometer, ...(data.make ? { make: data.make } : {}), ...(data.model ? { model: data.model } : {}), ...(data.year ? { year: data.year } : {}) }, include: { customer: true } });
      }

      const orderNo = await nextDocumentNumber(tx);
      const created = await tx.serviceOrder.create({
        data: {
          orderNo,
          channel: data.channel,
          branchId: session.branchId!,
          shiftId: shift.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          odometer: data.odometer,
          status: "OPEN",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "VEHICLE_INTAKE_CREATED",
          entityType: "ServiceOrder",
          entityId: created.id,
          afterJson: {
            orderNo: created.orderNo,
            plate: vehicle.plate,
            customerId: customer.id,
            shiftId: shift.id,
          },
        },
      });

      return created;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVICE_ORDER_CREATE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "OPEN_SHIFT_REQUIRED" ? 409 : 400 });
  }
}
