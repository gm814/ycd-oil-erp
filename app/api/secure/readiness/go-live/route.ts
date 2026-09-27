import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { evaluateGoLiveReadiness } from "@/lib/go-live-readiness";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.OPERATIONS_GO_LIVE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const readiness = await evaluateGoLiveReadiness(session.branchId);
  const branch = readiness.branch;

  if (!branch) return NextResponse.json({ error: "BRANCH_NOT_FOUND" }, { status: 404 });
  if (branch.operationalStatus === "LIVE") {
    return NextResponse.json({ branch, alreadyLive: true });
  }
  if (branch.operationalStatus === "SUSPENDED") {
    return NextResponse.json({ error: "BRANCH_SUSPENDED" }, { status: 423 });
  }

  if (!readiness.ready) {
    return NextResponse.json({
      error: "GO_LIVE_REQUIREMENTS_INCOMPLETE",
      missing: readiness.missing,
      summary: readiness.summary,
    }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx) => {
    const live = await tx.branch.update({
      where: { id: session.branchId! },
      data: {
        operationalStatus: "LIVE",
        goLiveAt: new Date(),
        goLiveBy: session.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: "BRANCH_GO_LIVE",
        entityType: "Branch",
        entityId: live.id,
        beforeJson: { operationalStatus: "PREOPENING" },
        afterJson: {
          operationalStatus: "LIVE",
          goLiveAt: live.goLiveAt?.toISOString() ?? null,
          readiness: readiness.summary,
        },
      },
    });

    return live;
  });

  return NextResponse.json({ branch: updated });
}
