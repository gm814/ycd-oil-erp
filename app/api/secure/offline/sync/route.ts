import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { offlineCommandSchema, offlineErrorMessages } from "@/lib/offline/contracts";
import { syncOfflineCommand } from "@/services/offline-sync";

export async function POST(request: Request) {
  if (process.env.YCD_OFFLINE_PILOT !== "true") return NextResponse.json({ error: "OFFLINE_NOT_ENABLED" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 100000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  let parsed;
  try { parsed = offlineCommandSchema.safeParse(JSON.parse(raw)); } catch { /* invalid JSON */ }
  if (!parsed?.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const result = await syncOfflineCommand(parsed.data, session);
    return NextResponse.json({ id: parsed.data.id, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SYNC_RETRY";
    const known = code in offlineErrorMessages;
    return NextResponse.json({ error: known ? code : "SYNC_RETRY" }, { status: known ? 409 : 503 });
  }
}
