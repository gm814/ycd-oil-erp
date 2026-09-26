import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  code: z.string().trim().min(2).max(30),
  nameAr: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional(),
  jobTitleAr: z.string().trim().max(120).optional(),
  hireDate: z.string().optional(),
  baseSalary: z.coerce.number().min(0).max(1_000_000),
  housingAllowance: z.coerce.number().min(0).max(1_000_000).default(0),
  transportAllowance: z.coerce.number().min(0).max(1_000_000).default(0),
  iban: z.string().trim().max(40).optional(),
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

  try {
    const employee = await db.employee.create({
      data: {
        branchId: session.branchId,
        code: parsed.data.code.toUpperCase(),
        nameAr: parsed.data.nameAr,
        phone: parsed.data.phone || null,
        jobTitleAr: parsed.data.jobTitleAr || null,
        hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate + "T00:00:00.000Z") : null,
        baseSalary: parsed.data.baseSalary,
        housingAllowance: parsed.data.housingAllowance,
        transportAllowance: parsed.data.transportAllowance,
        iban: parsed.data.iban || null,
      },
    });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "EMPLOYEE_CREATED",
        entityType: "Employee",
        entityId: employee.id,
        afterJson: { code: employee.code, nameAr: employee.nameAr, jobTitleAr: employee.jobTitleAr },
      },
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "EMPLOYEE_CREATE_FAILED" }, { status: 409 });
  }
}
