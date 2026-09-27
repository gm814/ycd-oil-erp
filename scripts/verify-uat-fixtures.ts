import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UAT_FIXTURE_VERIFY_FAILED: ${message}`);
}

async function main() {
  if (process.env.ALLOW_UAT_FIXTURES !== "true") {
    throw new Error("UAT_FIXTURE_VERIFY_REQUIRES_ALLOW_UAT_FIXTURES");
  }

  const branch = await prisma.branch.findUnique({
    where: { id: "riyadh-tuwaiq" },
    select: { id: true, operationalStatus: true },
  });
  assert(branch, "فرع طويق غير موجود");
  assert(branch.operationalStatus === "PREOPENING", "بيئة UAT يجب أن تبدأ من PREOPENING");

  const expectedProducts = new Map<string, { category: string; openingQty: number }>([
    ["UAT-OIL-5W30", { category: "OIL", openingQty: 20 }],
    ["UAT-FILTER-OIL", { category: "FILTER", openingQty: 25 }],
    ["UAT-SVC-OIL", { category: "SERVICE", openingQty: 0 }],
    ["UAT-SVC-WASH", { category: "SERVICE", openingQty: 0 }],
  ]);

  const products = await prisma.product.findMany({
    where: { sku: { in: [...expectedProducts.keys()] } },
    select: {
      id: true,
      sku: true,
      category: true,
      active: true,
      stockMovements: {
        where: { branchId: branch.id },
        select: { quantity: true, reference: true },
      },
    },
  });
  assert(products.length === expectedProducts.size, "أصناف UAT التجريبية غير مكتملة");

  for (const product of products) {
    const expected = expectedProducts.get(product.sku);
    assert(expected, `SKU غير متوقع: ${product.sku}`);
    assert(product.active, `${product.sku} يجب أن يكون نشطًا في UAT`);
    assert(product.category === expected.category, `تصنيف ${product.sku} غير مطابق`);

    const opening = product.stockMovements
      .filter((movement) => movement.reference === `UAT-OPENING-${product.sku}`)
      .reduce((sum, movement) => sum + Number(movement.quantity), 0);
    assert(Math.abs(opening - expected.openingQty) <= 0.001, `رصيد UAT الافتتاحي غير مطابق للصنف ${product.sku}`);
  }

  const supplier = await prisma.supplier.findUnique({ where: { code: "UAT-SUP-001" } });
  assert(supplier?.active, "مورد UAT غير موجود أو غير نشط");

  const [shifts, orders, invoices, payments, customerReceipts] = await Promise.all([
    prisma.shift.count({ where: { branchId: branch.id } }),
    prisma.serviceOrder.count({ where: { branchId: branch.id } }),
    prisma.invoice.count({ where: { serviceOrder: { branchId: branch.id } } }),
    prisma.payment.count({ where: { invoice: { serviceOrder: { branchId: branch.id } } } }),
    prisma.financialTransaction.count({ where: { branchId: branch.id, type: "CUSTOMER_RECEIPT" } }),
  ]);

  assert(shifts === 0, "Seed UAT يجب ألا ينشئ ورديات تلقائيًا");
  assert(orders === 0, "Seed UAT يجب ألا ينشئ أوامر خدمة تلقائيًا");
  assert(invoices === 0, "Seed UAT يجب ألا ينشئ فواتير تلقائيًا");
  assert(payments === 0, "Seed UAT يجب ألا ينشئ مدفوعات تلقائيًا");
  assert(customerReceipts === 0, "Seed UAT يجب ألا ينشئ تحصيلات عملاء تلقائيًا");

  console.log("YCD UAT FIXTURES VERIFIED");
  console.log(`Fixture products: ${products.length}`);
  console.log("Fixture suppliers: 1");
  console.log("Operational transactions created by fixture seed: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
