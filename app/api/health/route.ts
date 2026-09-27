import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        service: "ycd-oil-erp",
        database: "reachable",
        timestamp: new Date().toISOString(),
        responseMs: Date.now() - startedAt,
      },
      {
        status: 200,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "ycd-oil-erp",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  }
}
