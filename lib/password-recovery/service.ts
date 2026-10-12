import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { recoveryDestination, recoveryHash } from "./core";
import { recoveryChannels, twilioRecoveryProvider, type RecoveryChannel, type RecoveryProvider } from "./provider";

const TEN_MINUTES = 10 * 60 * 1000;

// Atomic database increment, shared across workers and deploys. No trusted-IP assumptions.
export async function recoveryLimit(scope: string, limit: number, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${recoveryHash(scope)}:${windowMs}:${bucket}`;
  const result = await db.passwordRecoveryLimit.upsert({
    where: { key }, create: { key, expiresAt: new Date((bucket + 1) * windowMs), count: 1 },
    update: { count: { increment: 1 } },
  });
  return result.count <= limit;
}

export async function requestRecovery(identifier: string, channel: RecoveryChannel, provider: RecoveryProvider = twilioRecoveryProvider()) {
  const challenge = randomBytes(32).toString("hex");
  // Global cost guard applies before creating arbitrary identifier buckets.
  if (!await recoveryLimit("send:global", 100)) return challenge;
  // Keep only recent operational records; do not retain recovery identifiers indefinitely.
  const retentionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.passwordRecoveryChallenge.deleteMany({ where: { expiresAt: { lt: retentionCutoff } } });
  await db.passwordRecoveryLimit.deleteMany({ where: { expiresAt: { lt: retentionCutoff } } });
  if (!await recoveryLimit(`send:identifier:${identifier}`, 5)) return challenge;
  const user = await db.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] }, include: { employee: true },
  });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) return challenge;
  const destination = recoveryDestination(user, channel);
  if (!destination) return challenge;
  // Username/email aliases and different channels share the account budget.
  if (!await recoveryLimit(`send:user:${user.id}`, 3) ||
      !await recoveryLimit(`send:destination:${destination}`, 3) ||
      !await recoveryLimit(`send:cooldown:${user.id}`, 1, 60_000)) return challenge;
  const tokenHash = recoveryHash(challenge);
  await db.passwordRecoveryChallenge.create({ data: {
    tokenHash, userId: user.id, channel, destinationHash: recoveryHash(destination),
    sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + TEN_MINUTES),
  } });
  try {
    const verificationSid = await provider.start(destination, channel);
    await db.passwordRecoveryChallenge.update({ where: { tokenHash }, data: { verificationSid } });
    await db.auditLog.create({ data: {
      action: "PASSWORD_RECOVERY_REQUESTED", entityType: "User", entityId: user.id,
      afterJson: { channel },
    } });
  } catch {
    // Never tell the caller whether an account or contact exists, or expose provider data.
    await db.passwordRecoveryChallenge.update({ where: { tokenHash }, data: { consumedAt: new Date() } });
    await db.auditLog.create({ data: {
      action: "PASSWORD_RECOVERY_DELIVERY_FAILED", entityType: "User", entityId: user.id,
      afterJson: { channel },
    } });
  }
  return challenge;
}

export async function completeRecovery(challenge: string, code: string, newPassword: string, provider: RecoveryProvider = twilioRecoveryProvider()) {
  if (!await recoveryLimit("check:global", 600)) return false;
  const tokenHash = recoveryHash(challenge);
  // Reserve a try atomically before the external check. No concurrent guess bypass.
  const reserved = await db.passwordRecoveryChallenge.updateMany({
    where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 }, verificationSid: { not: null } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) return false;
  const record = await db.passwordRecoveryChallenge.findUnique({ where: { tokenHash }, include: { user: { include: { employee: true } } } });
  if (!record?.verificationSid || !["email", "whatsapp"].includes(record.channel)) return false;
  const channel = record.channel as RecoveryChannel;
  if (!recoveryChannels().includes(channel)) return false;
  const destination = recoveryDestination(record.user, channel);
  if (!destination || record.user.status !== "ACTIVE" || record.user.sessionVersion !== record.sessionVersion || recoveryHash(destination) !== record.destinationHash) return false;
  if (!await provider.check(record.verificationSid, code)) return false;
  const passwordHash = await hash(newPassword, 12);
  try {
    await db.$transaction(async tx => {
      // Serialize all channels and admin password changes for this user.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE`;
      const before = await tx.user.findUnique({ where: { id: record.userId } });
      if (before?.employeeId) await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${before.employeeId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: record.userId }, include: { employee: true } });
      const currentDestination = user && recoveryDestination(user, channel);
      if (!user || user.status !== "ACTIVE" || user.sessionVersion !== record.sessionVersion || !currentDestination || recoveryHash(currentDestination) !== record.destinationHash) throw new Error("RECOVERY_INVALID");
      const claimed = await tx.passwordRecoveryChallenge.updateMany({
        where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("RECOVERY_INVALID");
      await tx.user.update({ where: { id: user.id }, data: {
        passwordHash, sessionVersion: { increment: 1 }, mustChangePassword: false,
        failedLoginCount: 0, lockedUntil: null,
      } });
      await tx.passwordRecoveryChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.auditLog.create({ data: {
        actorId: user.id, action: "USER_PASSWORD_RECOVERED", entityType: "User", entityId: user.id,
        afterJson: { channel, sessionsRevoked: true },
      } });
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "RECOVERY_INVALID") return false;
    throw error;
  }
}
