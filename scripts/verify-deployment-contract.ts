import { readFile } from "node:fs/promises";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DEPLOYMENT_CONTRACT_VERIFY_FAILED: ${message}`);
}

async function main() {
  const [packageJsonRaw, vercelRaw, envRaw, deploymentDoc] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("vercel.json", "utf8"),
    readFile(".env.production.example", "utf8"),
    readFile("docs/VERCEL_DEPLOYMENT.md", "utf8"),
  ]);

  const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
  const vercel = JSON.parse(vercelRaw) as { framework?: string; buildCommand?: string };
  const scripts = packageJson.scripts ?? {};

  assert(vercel.framework === "nextjs", "vercel.json يجب أن يثبت إطار Next.js");
  assert(vercel.buildCommand === "npm run vercel-build", "Vercel يجب أن يستخدم أمر البناء الآمن المعتمد");
  assert(
    scripts["vercel-build"] === "npm run db:generate && next build",
    "Vercel build يجب أن يولد Prisma Client قبل Next.js build",
  );
  assert(scripts["db:deploy"] === "prisma migrate deploy", "أمر migrations الإنتاجي غير مثبت");
  assert(scripts["verify:production-env"], "فحص بيئة الإنتاج غير معرف");
  assert(scripts["verify:go-live"], "فحص GO LIVE غير معرف");

  for (const key of ["DATABASE_URL", "AUTH_SECRET", "ALLOW_PREOPENING_OPERATIONS", "VAT_RATE", "WASH_COUPON_VALIDITY_DAYS"]) {
    assert(envRaw.includes(key), `متغير الإنتاج مفقود من القالب: ${key}`);
  }
  assert(
    envRaw.includes('ALLOW_PREOPENING_OPERATIONS="false"'),
    "قالب الإنتاج يجب أن يبقي تجاوز PREOPENING معطلاً",
  );
  assert(
    deploymentDoc.includes("npm run db:deploy"),
    "دليل Vercel يجب أن يعتمد migrations الإنتاجية",
  );
  assert(
    deploymentDoc.includes("لا تستخدم \`prisma db push\` في الإنتاج"),
    "دليل Vercel يجب أن يمنع db push على قاعدة الإنتاج",
  );

  console.log("YCD DEPLOYMENT CONTRACT VERIFIED");
  console.log("Vercel build: Prisma generate + Next.js build");
  console.log("Production migrations: deploy-only");
  console.log("PREOPENING bypass: disabled by template");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
