import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { operationalTeam } from "@/lib/operations";

const rowSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameAr: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional().default(""),
  jobTitleAr: z.string().trim().min(2).max(160),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseSalary: z.coerce.number().min(0).max(1_000_000),
  housingAllowance: z.coerce.number().min(0).max(1_000_000).default(0),
  transportAllowance: z.coerce.number().min(0).max(1_000_000).default(0),
  iban: z.string().trim().max(34).optional().default(""),
});

const schema = z.object({
  batchId: z.string().trim().min(8).max(120),
  rows: z.array(rowSchema).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.HR_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const rows = parsed.data.rows.map((row) => ({
    ...row,
    code: row.code.toUpperCase(),
    iban: row.iban.replace(/\s+/g, "").toUpperCase(),
  }));
  if (new Set(rows.map((row) => row.code)).size !== rows.length) {
    return NextResponse.json({ error: "DUPLICATE_EMPLOYEE_CODE_IN_BATCH" }, { status: 409 });
  }

  const plannedCodes = new Set(operationalTeam.map((member) => member.code));
  if (rows.some((row) => !plannedCodes.has(row.code as (typeof operationalTeam)[number]["code"]))) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_IN_OPERATIONAL_PLAN" }, { status: 409 });
  }
  const plannedByCode = new Map(operationalTeam.map((member) => [member.code, member]));
  const nameMismatch = rows.find((row) => plannedByCode.get(row.code as (typeof operationalTeam)[number]["code"])?.nameAr !== row.nameAr);
  if (nameMismatch) {
    return NextResponse.json({ error: `EMPLOYEE_NAME_MISMATCH:${nameMismatch.code}` }, { status: 409 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: session.branchId! },
        select: { operationalStatus: true },
      });
      if (!branch) throw new Error("BRANCH_NOT_FOUND");
      if (branch.operationalStatus !== "PREOPENING") throw new Error("PREOPENING_IMPORT_ONLY");

      let updated = 0;
      for (const row of rows) {
        const employee = await tx.employee.findFirst({
          where: { code: row.code, branchId: session.branchId!, active: true },
        });
        if (!employee) throw new Error(`EMPLOYEE_NOT_FOUND:${row.code}`);

        await tx.employee.update({
          where: { id: employee.id },
          data: {
            phone: row.phone || null,
            jobTitleAr: row.jobTitleAr,
            hireDate: new Date(`${row.hireDate}T00:00:00+03:00`),
            baseSalary: row.baseSalary,
            housingAllowance: row.housingAllowance,
            transportAllowance: row.transportAllowance,
            iban: row.iban || null,
          },
        });
        updated++;
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "PREOPENING_EMPLOYEE_HR_IMPORTED",
          entityType: "Branch",
          entityId: session.branchId!,
          afterJson: {
            batchId: parsed.data.batchId,
            rowCount: rows.length,
            updated,
            fields: ["nameAr_verified", "phone", "jobTitleAr", "hireDate", "baseSalary", "housingAllowance", "transportAllowance", "iban"],
          },
        },
      });

      return { rowCount: rows.length, created: 0, updated };
    });

    return NextResponse.json({ import: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PREOPENING_EMPLOYEE_HR_IMPORT_FAILED";
    const status = code === "BRANCH_NOT_FOUND" || code.startsWith("EMPLOYEE_NOT_FOUND:") ? 404 : 409;
    return NextResponse.json({ error: code }, { status });
  }
}
