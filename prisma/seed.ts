import { hash } from "bcryptjs";
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

  const branch = await prisma.branch.upsert({
    where: { id: "riyadh-tuwaiq" },
    update: {},
    create: {
      id: "riyadh-tuwaiq",
      organizationId: organization.id,
      nameAr: "الفرع الأول – الرياض - حي طويق",
      city: "الرياض",
    },
  });

  const permissionCodes = [
    "dashboard.view",
    "service_order.create",
    "service_order.approve",
    "inventory.issue",
    "invoice.issue",
    "payment.receive",
    "shift.close",
    "audit.view",
  ];

  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      }),
    );
  }

  const role = await prisma.role.upsert({
    where: { code: "GENERAL_MANAGER" },
    update: { nameAr: "المدير العام" },
    create: { code: "GENERAL_MANAGER", nameAr: "المدير العام" },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {
        name: "مدير النظام",
        passwordHash,
        branchId: branch.id,
        status: "ACTIVE",
      },
      create: {
        email: adminEmail.toLowerCase(),
        name: "مدير النظام",
        passwordHash,
        branchId: branch.id,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: {},
      create: { userId: admin.id, roleId: role.id },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
