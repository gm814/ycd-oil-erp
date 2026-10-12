export const RECOVERY_CHANNELS = ["email", "whatsapp"] as const;
export type RecoveryChannel = typeof RECOVERY_CHANNELS[number];

// Explicit opt-in: credentials alone must not activate public message sending.
export function recoveryChannels(env: Record<string, string | undefined> = process.env): RecoveryChannel[] {
  if (!/^AC[0-9a-f]{32}$/i.test(env.RECOVERY_TWILIO_ACCOUNT_SID ?? "") ||
      !/^VA[0-9a-f]{32}$/i.test(env.RECOVERY_TWILIO_SERVICE_SID ?? "") ||
      !env.RECOVERY_TWILIO_AUTH_TOKEN || !env.AUTH_SECRET) return [];
  const enabled = (env.RECOVERY_CHANNELS ?? "").split(",").map(s => s.trim());
  return RECOVERY_CHANNELS.filter(channel => enabled.includes(channel));
}

export interface RecoveryProvider {
  start(destination: string, channel: RecoveryChannel): Promise<string>;
  check(verificationSid: string, code: string): Promise<boolean>;
}

export function twilioRecoveryProvider(transport: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): RecoveryProvider {
  async function post(path: string, fields: Record<string, string>) {
    if (!recoveryChannels(env).length) throw new Error("RECOVERY_UNAVAILABLE");
    const response = await transport(`https://verify.twilio.com/v2/Services/${env.RECOVERY_TWILIO_SERVICE_SID}/${path}`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Basic ${Buffer.from(`${env.RECOVERY_TWILIO_ACCOUNT_SID}:${env.RECOVERY_TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
    });
    // Do not log provider response bodies (they contain personal data).
    if (!response.ok) throw new Error("RECOVERY_PROVIDER_FAILED");
    return await response.json() as { sid?: string; status?: string };
  }
  return {
    async start(destination, channel) {
      if (!recoveryChannels(env).includes(channel)) throw new Error("RECOVERY_UNAVAILABLE");
      const result = await post("Verifications", { To: destination, Channel: channel, Locale: "ar" });
      if (result.status !== "pending" || !/^VE[0-9a-f]{32}$/i.test(result.sid ?? "")) throw new Error("RECOVERY_PROVIDER_FAILED");
      return result.sid!;
    },
    async check(verificationSid, code) {
      if (!/^VE[0-9a-f]{32}$/i.test(verificationSid) || !/^\d{4,10}$/.test(code)) return false;
      try {
        const result = await post("VerificationCheck", { VerificationSid: verificationSid, Code: code });
        return result.sid === verificationSid && result.status === "approved";
      } catch { return false; }
    },
  };
}
