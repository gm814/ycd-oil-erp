import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.AUDIT_VIEW)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const defaults = riyadhMonthToDateStrings();
  const from = url.searchParams.get("from") || defaults.from;
  const to = url.searchParams.get("to") || defaults.to;
  const range = riyadhDateRange(from, to) ?? riyadhDateRange(defaults.from, defaults.to)!;
  const action = (url.searchParams.get("action") || "").trim();
  const actor = (url.searchParams.get("actor") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();

  const rows = await db.auditLog.findMany({
    where: {
      actor: { branchId: session.branchId },
      createdAt: { gte: range.start, lt: range.end },
      ...(action ? { action } : {}),
      ...(actor ? { actorId: actor } : {}),
      ...(q ? {
        OR: [
          { action: { contains: q, mode: "insensitive" as const } },
          { entityType: { contains: q, mode: "insensitive" as const } },
          { entityId: { contains: q, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    include: { actor: { select: { name: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = ["timestamp_riyadh", "user", "username", "action", "entity_type", "entity_id", "before_json", "after_json"];
  const body = rows.map((row) => [
    row.createdAt.toLocaleString("sv-SE", { timeZone: "Asia/Riyadh" }),
    row.actor?.name || "SYSTEM",
    row.actor?.username || "",
    row.action,
    row.entityType,
    row.entityId || "",
    row.beforeJson ? JSON.stringify(row.beforeJson) : "",
    row.afterJson ? JSON.stringify(row.afterJson) : "",
  ].map(csvCell).join(","));

  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...body].join("\r\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ycd-audit-${from}-to-${to}.csv"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
