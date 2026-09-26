import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  code: z.string().trim().min(2).max(40),
  legalNameAr: z.string().trim().min(3).max(200),
  brandName: z.string().trim().max(120).optional(),
  relationType: z.enum(["PARENT", "SUBSIDIARY", "AFFILIATE"]),
  unifiedNumber: z.string().trim().max(30).optional(),
  crNumber: z.string().trim().max(30).optional(),
  vatNumber: z.string().trim().max(30).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.GROUP_FUNDING_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const branchRecord = await db.branch.findUnique({
      where: { id: session.branchId },
      select: { organizationId: true },
    });
    if (!branchRecord) return NextResponse.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });

    const company = await db.groupCompany.create({
      data: {
        organizationId: branchRecord.organizationId,
        code: parsed.data.code.toUpperCase(),
        legalNameAr: parsed.data.legalNameAr,
        brandName: parsed.data.brandName || null,
        relationType: parsed.data.relationType,
        unifiedNumber: parsed.data.unifiedNumber || null,
        crNumber: parsed.data.crNumber || null,
        vatNumber: parsed.data.vatNumber || null,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "GROUP_COMPANY_REGISTERED",
        entityType: "GroupCompany",
        entityId: company.id,
        afterJson: {
          code: company.code,
          legalNameAr: company.legalNameAr,
          relationType: company.relationType,
        },
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "GROUP_COMPANY_CREATE_FAILED" }, { status: 409 });
  }
}
