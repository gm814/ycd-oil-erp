import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { performWashAction, WashAction } from "@/services/wash-settlement";
const id = z.string().min(1).max(100);
const amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), washBranchId: id, nameAr: z.string().trim().min(2).max(120), unitAmount: amount.optional(), cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]), issueMode: z.enum(["ELIGIBLE", "ALL"]).optional() }),
  z.object({ action: z.literal("inspect"), serial: z.string().trim().min(6).max(2048) }),
  z.object({ action: z.literal("redeem"), serial: z.string().trim().min(6).max(2048), expectedAmount: amount.optional() }),
  z.object({ action: z.literal("complete"), serviceId: id }),
  z.object({ action: z.literal("value"), serviceId: id, amount }),
  z.object({ action: z.literal("submit"), agreementId: id, businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), key: z.string().uuid() }),
  z.object({ action: z.literal("post"), batchId: id }),
  z.object({ action: z.literal("reject"), batchId: id }),
  z.object({ action: z.literal("pay"), batchId: id, amount, accountId: id, receiptAccountId: id, reference: z.string().trim().min(2).max(120), key: z.string().uuid() }),
]);
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    return NextResponse.json(await performWashAction(session, parsed.data as WashAction), {headers:{"cache-control":"no-store"}});
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : null;
    const error = code === "P2034" || code === "P2002" ? "CONCURRENT_CHANGE" : e instanceof Error ? e.message : "WASH_ACTION_FAILED";
    return NextResponse.json({ error }, { status: error === "FORBIDDEN" ? 403 : 409 });
  }
}
