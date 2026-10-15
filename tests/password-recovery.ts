import assert from "node:assert/strict";
import { compare } from "bcryptjs";
import { db } from "../lib/db";
import { requestRecovery, completeRecovery, recoveryLimit } from "../lib/password-recovery/service";
import { recoveryHash, recoveryPhone } from "../lib/password-recovery/core";
import { recoveryChannels, twilioRecoveryProvider, type RecoveryProvider } from "../lib/password-recovery/provider";
import { recoveryInput } from "../lib/password-recovery/http";

async function main() {
  // Integration fixtures must NEVER be run against a hosted/customer database.
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.RECOVERY_TEST_DATABASE, "disposable");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  process.env.AUTH_SECRET = "disposable-local-recovery-test-secret";
  const sid = `VE${"a".repeat(32)}`;
  const env = { AUTH_SECRET: "test", RECOVERY_TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, RECOVERY_TWILIO_AUTH_TOKEN: "test-only", RECOVERY_TWILIO_SERVICE_SID: `VA${"b".repeat(32)}`, RECOVERY_CHANNELS: "email,whatsapp" };
  Object.assign(process.env, env);
  assert.deepEqual(recoveryChannels({}), []);
  assert.deepEqual(recoveryChannels({ ...env, RECOVERY_CHANNELS: "sms" }), []);
  assert.deepEqual(recoveryChannels(env), ["email", "whatsapp"]);
  assert.equal(recoveryPhone("050 123 4567"), "+966501234567");
  assert.equal(recoveryPhone("00966501234567"), "+966501234567");
  assert.equal(recoveryPhone("abc"), null);
  const calls: Array<{ path: string; body: URLSearchParams }> = [];
  const adapter = twilioRecoveryProvider((async (input, init) => {
    calls.push({ path: String(input), body: new URLSearchParams(String(init?.body)) });
    return Response.json({ sid, status: String(input).endsWith("VerificationCheck") ? "approved" : "pending" });
  }) as typeof fetch, env);
  await adapter.start("+966501234567", "whatsapp");
  assert.equal(calls[0].body.get("Channel"), "whatsapp");
  assert.equal(await adapter.check(sid, "123456"), true);
  assert.equal(calls[1].body.get("VerificationSid"), sid);
  assert.equal(calls[1].body.has("To"), false);
  const rejected = twilioRecoveryProvider((async () => Response.json({ status: "approved", sid: `VE${"c".repeat(32)}` })) as typeof fetch, env);
  assert.equal(await rejected.check(sid, "123456"), false);
  const body = JSON.stringify({ identifier: "test" });
  assert.equal(await recoveryInput(new Request("https://example.test/api", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body })), null);
  assert.equal(await recoveryInput(new Request("https://example.test/api", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(3000) }) })), null);

  let sent: Array<[string, string]> = []; let checked = 0;
  const provider: RecoveryProvider = { start: async (to, channel) => { sent.push([to, channel]); return sid; }, check: async (_, code) => { checked++; return code === "123456"; } };
  const org = await db.organization.create({ data: { nameAr: "Test", brandName: "Test" } });
  const branch = await db.branch.create({ data: { organizationId: org.id, nameAr: "Test" } });
  const employee = await db.employee.create({ data: { branchId: branch.id, code: `recovery-${Date.now()}`, nameAr: "Test", phone: "0501234567" } });
  const user = await db.user.create({ data: { username: `recovery-${Date.now()}`, name: "Test", email: `recovery-${Date.now()}@example.test`, passwordHash: "old-hash", employeeId: employee.id } });
  async function reset() {
    await db.passwordRecoveryLimit.deleteMany();
    await db.passwordRecoveryChallenge.deleteMany();
    await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", sessionVersion: 0, recoveryWhatsApp: "+966501234567", email: user.email, passwordHash: "old-hash", failedLoginCount: 4, lockedUntil: new Date(Date.now() + 900000) } });
    await db.employee.update({ where: { id: employee.id }, data: { active: true, phone: "0501234567" } });
    sent = []; checked = 0;
  }
  try {
    await reset();
    const token = await requestRecovery(user.username, "email", provider);
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.deepEqual(sent, [[user.email, "email"]]);
    const stored = await db.passwordRecoveryChallenge.findUniqueOrThrow({ where: { tokenHash: recoveryHash(token) } });
    assert.notEqual(stored.tokenHash, token);
    assert.equal(JSON.stringify(stored).includes(user.email!), false);
    const results = await Promise.all([completeRecovery(token, "123456", "Aa123456", provider), completeRecovery(token, "123456", "Bb123456", provider)]);
    assert.equal(results.filter(Boolean).length, 1);
    let updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updated.sessionVersion, 1); assert.equal(updated.failedLoginCount, 0); assert.equal(updated.lockedUntil, null);
    assert.equal(updated.mustChangePassword, false);
    assert.equal(await compare(results[0] ? "Aa123456" : "Bb123456", updated.passwordHash!), true);
    assert.equal(await completeRecovery(token, "123456", "Cc123456", provider), false);

    await reset();
    const whatsapp = await requestRecovery(user.username, "whatsapp", provider);
    assert.deepEqual(sent, [["+966501234567", "whatsapp"]]);
    for (let i = 0; i < 5; i++) assert.equal(await completeRecovery(whatsapp, "000000", "Aa123456", provider), false);
    assert.equal(await completeRecovery(whatsapp, "123456", "Aa123456", provider), false);
    assert.equal(checked, 5);

    await reset();
    const expired = await requestRecovery(user.username, "email", provider);
    await db.passwordRecoveryChallenge.update({ where: { tokenHash: recoveryHash(expired) }, data: { expiresAt: new Date(0) } });
    assert.equal(await completeRecovery(expired, "123456", "Aa123456", provider), false);
    assert.equal(checked, 0);

    await reset();
    const changed = await requestRecovery(user.username, "email", provider);
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    assert.equal(await completeRecovery(changed, "123456", "Aa123456", provider), false);

    await reset();
    const contact = await requestRecovery(user.username, "whatsapp", provider);
    const changeDuringCheck: RecoveryProvider = { ...provider, check: async () => { await db.user.update({ where: { id: user.id }, data: { recoveryWhatsApp: "+966509876543" } }); return true; } };
    assert.equal(await completeRecovery(contact, "123456", "Aa123456", changeDuringCheck), false);
    updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updated.passwordHash, "old-hash");

    await reset();
    await requestRecovery("no-such-account", "email", provider); assert.equal(sent.length, 0);
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await requestRecovery(user.username, "email", provider); assert.equal(sent.length, 0);
    await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", email: null } });
    await requestRecovery(user.username, "email", provider); assert.equal(sent.length, 0);

    await reset();
    await requestRecovery(user.username, "email", provider);
    await requestRecovery(user.email!, "whatsapp", provider);
    assert.equal(sent.length, 1, "aliases/channels cannot bypass cooldown");
    const limits = await Promise.all(Array.from({ length: 10 }, () => recoveryLimit("race-test", 3)));
    assert.equal(limits.filter(Boolean).length, 3);

    await reset();
    const failed = await requestRecovery(user.username, "email", { ...provider, start: async () => { throw Error("provider down"); } });
    assert.equal(await completeRecovery(failed, "123456", "Aa123456", provider), false);
    const audits = await db.auditLog.findMany({ where: { entityId: user.id } });
    assert.ok(audits.some(a => a.action === "USER_PASSWORD_RECOVERED"));
    assert.ok(audits.some(a => a.action === "PASSWORD_RECOVERY_DELIVERY_FAILED"));
    assert.equal(JSON.stringify(audits).includes("Aa123456"), false);
    console.log("Passed: email/WhatsApp routing, configuration gates, provider SID binding, same-origin/body limits, expiry, 5 guesses, replay, concurrent consume, session revocation, contact changes, generic unknown-account flow, cooldown aliases, atomic rate limits, delivery failure, safe audit.");
  } finally {
    await db.auditLog.deleteMany({ where: { entityId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.employee.delete({ where: { id: employee.id } });
    await db.branch.delete({ where: { id: branch.id } });
    await db.organization.delete({ where: { id: org.id } });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
