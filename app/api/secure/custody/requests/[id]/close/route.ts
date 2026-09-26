import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.permissions, PERMISSIONS.CUSTODY_CLOSE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const custody = await db.$transaction(async (tx) => {
      const current = await tx.custodyRequest.findUnique({ where: { id } });
      if (!current || current.branchId !== session.branchId) throw new Error("CUSTODY_NOT_FOUND");
      if (current.status !== "SETTLED") throw new Error("FULL_SETTLEMENT_REQUIRED");

      const updated = await tx.custodyRequest.update({
        where: { id },
        data: { status: "CLOSED", closedBy: session.userId, closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "CUSTODY_CLOSED",
          entityType: "CustodyRequest",
          entityId: id,
        },
      });
      return updated;
    });
    return NextResponse.json({ custody });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTODY_CLOSE_FAILED";
    return NextResponse.json({ error: code }, { status: code.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}
