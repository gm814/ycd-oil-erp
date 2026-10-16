import { after, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { requestRecovery, recoveryConfig, tokenHash, takeQuota } from "@/lib/account-recovery";
import { PASSWORD_REGEX } from "@/lib/password-policy";

const requestSchema = z.object({ email: z.string().trim().email().max(200), kind: z.enum(["password", "username"]) });
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().regex(PASSWORD_REGEX) });
function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    if (!process.env.APP_ORIGIN || request.headers.get("origin") !== new URL(process.env.APP_ORIGIN).origin) return reply({ error: "FORBIDDEN" }, 403);
    const body = await request.json().catch(() => null);
    if (body?.token !== undefined) {
      const input = resetSchema.safeParse(body);
      if (!input.success) return reply({ error: "INVALID_INPUT" }, 400);
      if (!await takeQuota("reset-global", 200)) return reply({ error: "TRY_LATER" }, 429);
      const passwordHash = await hash(input.data.password, 12);
      await db.$transaction(async (tx) => {
        const digest = tokenHash(input.data.token);
        const record = await tx.accountRecoveryToken.findUnique({ where: { tokenHash: digest } });
        if (!record || record.expiresAt <= new Date()) throw new Error("INVALID_TOKEN");
        const consumed = await tx.accountRecoveryToken.deleteMany({ where: { tokenHash: digest, expiresAt: { gt: new Date() } } });
        if (consumed.count !== 1) throw new Error("INVALID_TOKEN");
        const changed = await tx.user.updateMany({ where: { id: record.userId, email: record.email, status: "ACTIVE", sessionVersion: record.sessionVersion }, data: {
          passwordHash, sessionVersion: { increment: 1 }, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null,
        } });
        if (changed.count !== 1) throw new Error("INVALID_TOKEN");
        await tx.auditLog.create({ data: { actorId: record.userId, action: "PASSWORD_RECOVERED", entityType: "User", entityId: record.userId } });
      });
      return reply({ ok: true });
    }
    const input = requestSchema.safeParse(body);
    if (!input.success) return reply({ error: "INVALID_INPUT" }, 400);
    if (!recoveryConfig()) return reply({ error: "UNAVAILABLE" }, 503);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    // Mail and account lookup happen after the generic response, preventing
    // account existence from being exposed through SMTP response timing.
    after(async () => {
      try { await requestRecovery(input.data.email.toLowerCase(), input.data.kind, ip); }
      catch { console.error("ACCOUNT_RECOVERY_PROCESSING_FAILED"); }
    });
    return reply({ ok: true, message: "إذا كان البريد مرتبطًا بحساب نشط، فستصلك رسالة الاستعادة. راجع البريد غير المرغوب فيه أيضًا." });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TOKEN") return reply({ error: "INVALID_TOKEN" }, 400);
    console.error("ACCOUNT_RECOVERY_UNAVAILABLE");
    return reply({ error: "UNAVAILABLE" }, 503);
  }
}
