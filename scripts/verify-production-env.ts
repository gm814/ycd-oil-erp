function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PRODUCTION_ENV_VERIFY_FAILED: ${message}`);
}

function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const authSecret = process.env.AUTH_SECRET ?? "";
  const allowPreopening = (process.env.ALLOW_PREOPENING_OPERATIONS ?? "false").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  assert(databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"), "DATABASE_URL يجب أن يكون PostgreSQL");
  assert(!/localhost|127\.0\.0\.1/i.test(databaseUrl), "DATABASE_URL الإنتاجي لا يجب أن يشير إلى localhost");
  assert(authSecret.length >= 48, "AUTH_SECRET الإنتاجي يجب ألا يقل عن 48 حرفًا");
  assert(!/replace-with|change-me|example/i.test(authSecret), "AUTH_SECRET ما زال قيمة تجريبية");
  assert(allowPreopening === "false", "ALLOW_PREOPENING_OPERATIONS يجب أن يبقى false في الإنتاج");
  if (adminPassword) {
    assert(adminPassword.length >= 14, "ADMIN_PASSWORD عند استخدامه يجب ألا يقل عن 14 حرفًا");
    assert(!/password|admin|123456|ycdoil/i.test(adminPassword), "ADMIN_PASSWORD ضعيف أو متوقع");
  }

  console.log("YCD PRODUCTION ENVIRONMENT VERIFIED");
  console.log("Database target: non-local PostgreSQL");
  console.log("Authentication secret: acceptable length");
  console.log("Preopening bypass: disabled");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
