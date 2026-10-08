import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { performWashAction } from "@/services/wash-settlement";
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = z.object({ serial: z.string().trim().min(6).max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try { return NextResponse.json(await performWashAction(session, { action: "redeem", serial: parsed.data.serial })); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "WASH_ACTION_FAILED" }, { status: 409 }); }
}
