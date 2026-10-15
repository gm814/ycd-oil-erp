import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { recoveryChannels } from "@/lib/password-recovery/provider";
import { recoveryInput, recoveryResponse } from "@/lib/password-recovery/http";
import { requestRecovery } from "@/lib/password-recovery/service";

export const runtime = "nodejs";
const schema = z.object({ identifier: z.string().trim().min(2).max(200).transform(s => s.toLowerCase()), channel: z.enum(["email", "whatsapp"]) }).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await recoveryInput(request));
  if (!parsed.success) return recoveryResponse({ error: "INVALID_INPUT" }, 400);
  if (!recoveryChannels().includes(parsed.data.channel)) return recoveryResponse({ error: "RECOVERY_UNAVAILABLE" }, 503);
  const started = Date.now();
  let challenge = randomBytes(32).toString("hex");
  try { challenge = await requestRecovery(parsed.data.identifier, parsed.data.channel); }
  catch { console.error("PASSWORD_RECOVERY_REQUEST_FAILED"); }
  // Match normal provider latency for unknown, disabled, missing-contact and limited accounts.
  await setTimeout(Math.max(0, 9000 - (Date.now() - started)));
  return recoveryResponse({ challenge, message: "إذا كان الحساب ووسيلة الاستعادة مسجلين، فسيصلك رمز التحقق. قد يستغرق وصوله بضع دقائق." }, 202);
}
