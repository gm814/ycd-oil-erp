import { z } from "zod";
import { PASSWORD_REGEX } from "@/lib/password-policy";
import { SESSION_COOKIE } from "@/lib/auth";
import { recoveryChannels } from "@/lib/password-recovery/provider";
import { recoveryInput, recoveryResponse } from "@/lib/password-recovery/http";
import { completeRecovery } from "@/lib/password-recovery/service";

export const runtime = "nodejs";
const schema = z.object({
  challenge: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().regex(/^\d{4,10}$/),
  newPassword: z.string().regex(PASSWORD_REGEX), confirmPassword: z.string().max(200),
}).strict().refine(data => data.newPassword === data.confirmPassword);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await recoveryInput(request));
  if (!parsed.success) return recoveryResponse({ error: "INVALID_INPUT" }, 400);
  if (!recoveryChannels().length) return recoveryResponse({ error: "RECOVERY_UNAVAILABLE" }, 503);
  try {
    const { challenge, code, newPassword } = parsed.data;
    if (!await completeRecovery(challenge, code, newPassword)) return recoveryResponse({ error: "RECOVERY_INVALID" }, 400);
    const response = recoveryResponse({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
    return response;
  } catch { return recoveryResponse({ error: "RECOVERY_UNAVAILABLE" }, 503); }
}
