import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "ycd-oil" },
    update: {},
    create: {
      id: "ycd-oil",
      nameAr: "شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
      brandName: "YCD OIL",
      vatNumber: "311380910800003",
      crNumber: "1009014238",
    },
  });

  await prisma.branch.upsert({
    where: { id: "riyadh-tuwaiq" },
    update: {},
    create: {
      id: "riyadh-tuwaiq",
      organizationId: organization.id,
      nameAr: "الفرع الأول – الرياض - حي طويق",
      city: "الرياض",
    },
  });

  const permissions = [
    "dashboard.view", "service_order.create", "service_order.approve",
    "inventory.issue", "invoice.issue", "payment.receive", "shift.close", "audit.view"
  ];
  for (const code of permissions) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  await prisma.role.upsert({
    where: { code: "GENERAL_MANAGER" },
    update: {},
    create: { code: "GENERAL_MANAGER", nameAr: "المدير العام" },
  });
}

main().finally(() => prisma.$disconnect());
