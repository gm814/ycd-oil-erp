import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  code: z.string().trim().min(2).max(30),
  nameAr: z.string().trim().min(2).max(160),
  vatNumber: z.string().trim().max(30).optional(),
  crNumber: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_QUOTE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const supplier = await db.supplier.create({
      data: {
        ...parsed.data,
        code: parsed.data.code.toUpperCase(),
        vatNumber: parsed.data.vatNumber || null,
        crNumber: parsed.data.crNumber || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
      },
    });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier.id,
        afterJson: { code: supplier.code, nameAr: supplier.nameAr },
      },
    });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "SUPPLIER_CREATE_FAILED" }, { status: 409 });
  }
}
