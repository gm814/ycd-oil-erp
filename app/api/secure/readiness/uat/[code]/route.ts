import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { isUatCaseCode, UAT_CASES } from "@/lib/uat";

const schema = z.object({
  status: z.enum(["PASSED", "FAILED"]),
  evidenceRef: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "PASSED" && !value.evidenceRef?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRef"],
      message: "UAT_EVIDENCE_REQUIRED",
    });
  }
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.OPERATIONS_UAT)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { code } = await context.params;
  if (!isUatCaseCode(code)) return NextResponse.json({ error: "UAT_CASE_NOT_FOUND" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const branch = await db.branch.findUnique({
    where: { id: session.branchId },
    select: { operationalStatus: true },
  });
  if (!branch) return NextResponse.json({ error: "BRANCH_NOT_FOUND" }, { status: 404 });
  if (branch.operationalStatus !== "PREOPENING") {
    return NextResponse.json({ error: "UAT_PREOPENING_ONLY" }, { status: 409 });
  }

  const testCase = UAT_CASES.find((item) => item.code === code)!;
  const result = await db.$transaction(async (tx) => {
    const before = await tx.uatTestResult.findUnique({
      where: { branchId_caseCode: { branchId: session.branchId!, caseCode: code } },
    });
    const updated = await tx.uatTestResult.upsert({
      where: { branchId_caseCode: { branchId: session.branchId!, caseCode: code } },
      update: {
        status: parsed.data.status,
        executedBy: session.userId,
        executedAt: new Date(),
        evidenceRef: parsed.data.evidenceRef || null,
        notes: parsed.data.notes || null,
      },
      create: {
        branchId: session.branchId!,
        caseCode: code,
        status: parsed.data.status,
        executedBy: session.userId,
        executedAt: new Date(),
        evidenceRef: parsed.data.evidenceRef || null,
        notes: parsed.data.notes || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: parsed.data.status === "PASSED" ? "UAT_CASE_PASSED" : "UAT_CASE_FAILED",
        entityType: "UatTestResult",
        entityId: updated.id,
        ...(before ? { beforeJson: { status: before.status, evidenceRef: before.evidenceRef, notes: before.notes } } : {}),
        afterJson: {
          caseCode: code,
          titleAr: testCase.titleAr,
          status: updated.status,
          evidenceRef: updated.evidenceRef,
          notes: updated.notes,
        },
      },
    });
    return updated;
  });

  return NextResponse.json({ result });
}
