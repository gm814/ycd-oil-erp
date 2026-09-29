import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  legalNameAr: z.string().trim().min(3).max(200).optional(),
  brandName: z.string().trim().max(120).optional(),
  relationType: z.enum(["PARENT", "SUBSIDIARY", "AFFILIATE"]).optional(),
  unifiedNumber: z.string().trim().max(30).optional(),
  crNumber: z.string().trim().max(30).optional(),
  vatNumber: z.string().trim().max(30).optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "NO_CHANGES",
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.GROUP_FUNDING_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  try {
    const company = await db.$transaction(async (tx) => {
      const current = await tx.groupCompany.findFirst({
        where: {
          id,
          organization: { branches: { some: { id: session.branchId! } } },
        },
      });
      if (!current) throw new Error("GROUP_COMPANY_NOT_FOUND");

      const updated = await tx.groupCompany.update({
        where: { id: current.id },
        data: {
          ...(parsed.data.legalNameAr ? { legalNameAr: parsed.data.legalNameAr } : {}),
          ...(parsed.data.brandName !== undefined ? { brandName: parsed.data.brandName || null } : {}),
          ...(parsed.data.relationType ? { relationType: parsed.data.relationType } : {}),
          ...(parsed.data.unifiedNumber !== undefined ? { unifiedNumber: parsed.data.unifiedNumber || null } : {}),
          ...(parsed.data.crNumber !== undefined ? { crNumber: parsed.data.crNumber || null } : {}),
          ...(parsed.data.vatNumber !== undefined ? { vatNumber: parsed.data.vatNumber || null } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "GROUP_COMPANY_UPDATED",
          entityType: "GroupCompany",
          entityId: current.id,
          beforeJson: {
            legalNameAr: current.legalNameAr,
            brandName: current.brandName,
            relationType: current.relationType,
            unifiedNumber: current.unifiedNumber,
            crNumber: current.crNumber,
            vatNumber: current.vatNumber,
          },
          afterJson: {
            legalNameAr: updated.legalNameAr,
            brandName: updated.brandName,
            relationType: updated.relationType,
            unifiedNumber: updated.unifiedNumber,
            crNumber: updated.crNumber,
            vatNumber: updated.vatNumber,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ company });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GROUP_COMPANY_UPDATE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "GROUP_COMPANY_NOT_FOUND" ? 404 : 400 });
  }
}
