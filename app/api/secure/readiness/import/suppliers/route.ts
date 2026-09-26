import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const rowSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameAr: z.string().trim().min(2).max(160),
  vatNumber: z.string().trim().max(30).optional().default(""),
  crNumber: z.string().trim().max(30).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
});
const schema = z.object({
  batchId: z.string().trim().min(8).max(120),
  rows: z.array(rowSchema).min(1).max(1000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.PROCUREMENT_QUOTE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const rows = parsed.data.rows.map((row) => ({ ...row, code: row.code.toUpperCase() }));
  if (new Set(rows.map((row) => row.code)).size !== rows.length) {
    return NextResponse.json({ error: "DUPLICATE_SUPPLIER_CODE_IN_BATCH" }, { status: 409 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: session.branchId! }, select: { operationalStatus: true } });
      if (!branch) throw new Error("BRANCH_NOT_FOUND");
      if (branch.operationalStatus !== "PREOPENING") throw new Error("PREOPENING_IMPORT_ONLY");

      let created = 0, updated = 0;
      for (const row of rows) {
        const existing = await tx.supplier.findUnique({ where: { code: row.code } });
        const data = {
          nameAr: row.nameAr, vatNumber: row.vatNumber || null, crNumber: row.crNumber || null,
          phone: row.phone || null, email: row.email || null, active: true,
        };
        if (existing) {
          await tx.supplier.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await tx.supplier.create({ data: { code: row.code, ...data } });
          created++;
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: session.userId, action: "PREOPENING_SUPPLIERS_IMPORTED",
          entityType: "Branch", entityId: session.branchId!,
          afterJson: { batchId: parsed.data.batchId, rowCount: rows.length, created, updated },
        },
      });
      return { rowCount: rows.length, created, updated };
    });
    return NextResponse.json({ import: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PREOPENING_SUPPLIER_IMPORT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "BRANCH_NOT_FOUND" ? 404 : 409 });
  }
}
