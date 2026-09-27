import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertUatEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("UAT_FIXTURES_BLOCKED_IN_PRODUCTION");
  }
  if (process.env.ALLOW_UAT_FIXTURES !== "true") {
    throw new Error("Set ALLOW_UAT_FIXTURES=true only in the isolated UAT database.");
  }
}

async function main() {
  assertUatEnvironment();

  const branch = await prisma.branch.findUnique({ where: { id: "riyadh-tuwaiq" } });
  if (!branch) throw new Error("UAT_BRANCH_NOT_FOUND");

  const fixtures = [
    {
      sku: "UAT-OIL-5W30",
      nameAr: "زيت محرك 5W-30 — اختبار UAT",
      category: "OIL" as const,
      unit: "عبوة",
      salePrice: 120,
      costPrice: 75,
      minStock: 2,
      grantsWashCoupon: true,
      openingQty: 20,
    },
    {
      sku: "UAT-FILTER-OIL",
      nameAr: "فلتر زيت — اختبار UAT",
      category: "FILTER" as const,
      unit: "حبة",
      salePrice: 35,
      costPrice: 18,
      minStock: 3,
      grantsWashCoupon: false,
      openingQty: 25,
    },
    {
      sku: "UAT-SVC-OIL",
      nameAr: "خدمة تغيير زيت — اختبار UAT",
      category: "SERVICE" as const,
      unit: "خدمة",
      salePrice: 25,
      costPrice: 0,
      minStock: 0,
      grantsWashCoupon: false,
      openingQty: 0,
    },
    {
      sku: "UAT-SVC-WASH",
      nameAr: "غسيل سيارة — اختبار UAT",
      category: "SERVICE" as const,
      unit: "خدمة",
      salePrice: 30,
      costPrice: 0,
      minStock: 0,
      grantsWashCoupon: false,
      openingQty: 0,
    },
  ];

  for (const item of fixtures) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        nameAr: item.nameAr,
        category: item.category,
        unit: item.unit,
        salePrice: item.salePrice,
        costPrice: item.costPrice,
        minStock: item.minStock,
        grantsWashCoupon: item.grantsWashCoupon,
        active: true,
      },
      create: {
        sku: item.sku,
        nameAr: item.nameAr,
        category: item.category,
        unit: item.unit,
        salePrice: item.salePrice,
        costPrice: item.costPrice,
        minStock: item.minStock,
        grantsWashCoupon: item.grantsWashCoupon,
        active: true,
      },
    });

    if (item.openingQty > 0) {
      const reference = `UAT-OPENING-${item.sku}`;
      const existing = await prisma.stockMovement.findFirst({
        where: { branchId: branch.id, productId: product.id, reference },
      });
      if (!existing) {
        await prisma.stockMovement.create({
          data: {
            branchId: branch.id,
            productId: product.id,
            type: "RECEIPT",
            quantity: item.openingQty,
            reference,
            performedBy: "uat-fixture",
          },
        });
      }
    }
  }

  await prisma.supplier.upsert({
    where: { code: "UAT-SUP-001" },
    update: {
      nameAr: "مورد اختبار UAT",
      phone: "0500000000",
      email: "uat-supplier@example.invalid",
      active: true,
    },
    create: {
      code: "UAT-SUP-001",
      nameAr: "مورد اختبار UAT",
      phone: "0500000000",
      email: "uat-supplier@example.invalid",
      active: true,
    },
  });

  console.log("YCD UAT FIXTURES READY");
  console.log("Use these records only in the isolated UAT database; never import them into production.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
