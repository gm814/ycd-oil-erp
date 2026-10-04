import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function recoveryConfig() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_ORIGIN } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !APP_ORIGIN) return null;
  const origin = new URL(APP_ORIGIN);
  if (origin.protocol !== "https:" || origin.username || origin.password) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) return null;
  return { origin: origin.origin, from: SMTP_FROM, transport: {
    host: SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, socketTimeout: 15000,
  } };
}

export async function takeQuota(key: string, max: number) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RecoveryRateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RecoveryRateLimit"."windowStart" < NOW() - INTERVAL '1 hour'
        THEN 1 ELSE "RecoveryRateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RecoveryRateLimit"."windowStart" < NOW() - INTERVAL '1 hour'
        THEN NOW() ELSE "RecoveryRateLimit"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= max;
}

export async function requestRecovery(email: string, kind: "password" | "username", ip: string) {
  const config = recoveryConfig();
  if (!config) throw new Error("RECOVERY_UNAVAILABLE");
  // Global quota also bounds storage and protects against rotating IP/email abuse.
  if (!await takeQuota("global", 100)) return;
  if (!await takeQuota(`ip:${tokenHash(ip)}`, 10)) return;
  if (!await takeQuota(`email:${tokenHash(email)}`, 3)) return;
  await db.accountRecoveryToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.recoveryRateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86400000) } } });
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: "ACTIVE" } });
  if (!user?.email) return;
  let digest: string | undefined;
  let text = `اسم الدخول إلى YCD OIL ERP هو: ${user.username}\n${config.origin}\nإذا لم تطلب هذه الرسالة فتجاهلها.`;
  if (kind === "password") {
    const token = randomBytes(32).toString("hex");
    digest = tokenHash(token);
    await db.accountRecoveryToken.create({ data: {
      tokenHash: digest, email: user.email, userId: user.id, sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    } });
    // Fragment avoids exposing the reset secret in server/proxy request logs.
    text = `لتعيين كلمة مرور جديدة افتح الرابط خلال 15 دقيقة:\n${config.origin}/recover#${token}\nالرابط للاستخدام مرة واحدة. إذا لم تطلبه فتجاهل الرسالة.`;
  }
  try {
    await nodemailer.createTransport(config.transport).sendMail({
      from: config.from, to: user.email,
      subject: kind === "password" ? "YCD OIL — استعادة كلمة المرور" : "YCD OIL — تذكير باسم الدخول",
      text,
    });
  } catch {
    if (digest) await db.accountRecoveryToken.deleteMany({ where: { tokenHash: digest } });
    // Never log provider errors: they may contain addresses or credentials.
    console.error("ACCOUNT_RECOVERY_DELIVERY_FAILED");
  }
}
