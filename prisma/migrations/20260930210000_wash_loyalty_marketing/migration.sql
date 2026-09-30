-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "loyaltyCode" TEXT;
UPDATE "Customer" SET "loyaltyCode" = gen_random_uuid()::text;
ALTER TABLE "Customer" ALTER COLUMN "loyaltyCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'OIL';

-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paidWashesRequired" INTEGER NOT NULL DEFAULT 4,
    "earningProductId" TEXT NOT NULL,
    "rewardProductId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingConsent" (
    "phone" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "evidence" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "idempotencyKey" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgram_branchId_key" ON "LoyaltyProgram"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_invoiceId_key" ON "LoyaltyEntry"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_orderId_key" ON "LoyaltyEntry"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_branchId_customerId_idx" ON "LoyaltyEntry"("branchId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingConsent_branchId_customerId_channel_key" ON "MarketingConsent"("branchId", "customerId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_idempotencyKey_key" ON "MarketingCampaign"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_loyaltyCode_key" ON "Customer"("loyaltyCode");

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_earningProductId_fkey" FOREIGN KEY ("earningProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_rewardProductId_fkey" FOREIGN KEY ("rewardProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_channel_valid" CHECK ("channel" IN ('OIL','WASH'));
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_threshold_valid" CHECK ("paidWashesRequired" BETWEEN 1 AND 100);
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_kind_valid" CHECK (("points" = 1 AND "invoiceId" IS NOT NULL AND "orderId" IS NULL) OR ("points" < 0 AND "invoiceId" IS NULL AND "orderId" IS NOT NULL));
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_channel_valid" CHECK ("channel" IN ('SMS','WHATSAPP'));
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_channel_valid" CHECK ("channel" IN ('SMS','WHATSAPP'));
INSERT INTO "Permission" (id,code) VALUES ('permission-marketing-manage','marketing.manage') ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE (r.code='GENERAL_MANAGER' AND p.code='marketing.manage') OR (r.code='WASH_SUPERVISOR' AND p.code IN ('service_order.create','inventory.issue','invoice.issue','payment.receive','customer.view')) ON CONFLICT DO NOTHING;
