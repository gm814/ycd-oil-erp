import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  assetNo: z.string().trim().min(2).max(40),
  nameAr: z.string().trim().min(2).max(160),
  categoryAr: z.string().trim().min(2).max(120),
  serialNo: z.string().trim().max(120).optional(),
  locationAr: z.string().trim().max(160).optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.coerce.number().min(0).max(100_000_000).optional(),
  nextMaintenanceAt: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.ASSET_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const asset = await db.asset.create({
      data: {
        assetNo: parsed.data.assetNo.toUpperCase(),
        branchId: session.branchId,
        nameAr: parsed.data.nameAr,
        categoryAr: parsed.data.categoryAr,
        serialNo: parsed.data.serialNo || null,
        locationAr: parsed.data.locationAr || null,
        purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate + "T00:00:00.000Z") : null,
        purchaseCost: parsed.data.purchaseCost ?? null,
        nextMaintenanceAt: parsed.data.nextMaintenanceAt ? new Date(parsed.data.nextMaintenanceAt + "T00:00:00.000Z") : null,
      },
    });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "ASSET_CREATED",
        entityType: "Asset",
        entityId: asset.id,
        afterJson: { assetNo: asset.assetNo, nameAr: asset.nameAr, categoryAr: asset.categoryAr },
      },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ASSET_CREATE_FAILED" }, { status: 409 });
  }
}
