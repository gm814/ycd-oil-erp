const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) throw new Error("BOOTSTRAP_COMMAND_FAILED");
}

async function main() {
  if (process.env.YCD_BOOTSTRAP !== "true") throw new Error("BOOTSTRAP_DISABLED");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  const db = new PrismaClient();
  try {
    if (await db.user.count() > 0) {
      console.log("BOOTSTRAP_SKIPPED_EXISTING_USERS");
      return;
    }
    if (await db.organization.count() > 0) throw new Error("EXISTING_DATA_REQUIRES_REVIEW");
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET_REQUIRED");
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 14) {
      throw new Error("ADMIN_CREDENTIALS_REQUIRED");
    }
    // The existing, approved seed supplies business configuration and permissions.
    // It runs only against a new database, never on a populated installation.
    run(["--import", "tsx", "prisma/seed.ts"]);
    const admin = await db.user.update({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      data: { mustChangePassword: true },
    });
    const roleCount = await db.userRole.count({ where: { userId: admin.id, role: { code: "GENERAL_MANAGER" } } });
    if (roleCount !== 1) throw new Error("ADMIN_ROLE_MISSING");
    console.log("BOOTSTRAP_COMPLETE_ADMIN_PASSWORD_CHANGE_REQUIRED");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  // Never print environment values or connection credentials.
  console.error("PRODUCTION_BOOTSTRAP_FAILED: inspect migration output and required configuration");
  process.exitCode = 1;
});
