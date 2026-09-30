-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "customerNo" TEXT;
UPDATE "Customer" SET "customerNo" = 'CUST-' || "id";
ALTER TABLE "Customer" ALTER COLUMN "customerNo" SET NOT NULL;

-- CreateTable
CREATE TABLE "WashAgreement" (
    "id" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "washBranchId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "unitAmount" DECIMAL(12,2),
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "issueMode" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WashAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashService" (
    "id" TEXT NOT NULL,
    "serviceNo" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(12,2),
    "receivedBy" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "batchId" TEXT,

    CONSTRAINT "WashService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashBatch" (
    "id" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "total" DECIMAL(12,2) NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "WashBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashSettlement" (
    "id" TEXT NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTransactionId" TEXT NOT NULL,
    "receiptTransactionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "WashSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WashAgreement_sourceBranchId_key" ON "WashAgreement"("sourceBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "WashService_serviceNo_key" ON "WashService"("serviceNo");

-- CreateIndex
CREATE UNIQUE INDEX "WashService_couponId_key" ON "WashService"("couponId");

-- CreateIndex
CREATE INDEX "WashService_agreementId_status_completedAt_idx" ON "WashService"("agreementId", "status", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WashBatch_batchNo_key" ON "WashBatch"("batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "WashBatch_idempotencyKey_key" ON "WashBatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WashBatch_agreementId_businessDate_idx" ON "WashBatch"("agreementId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "WashSettlement_settlementNo_key" ON "WashSettlement"("settlementNo");

-- CreateIndex
CREATE UNIQUE INDEX "WashSettlement_sourceTransactionId_key" ON "WashSettlement"("sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WashSettlement_receiptTransactionId_key" ON "WashSettlement"("receiptTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WashSettlement_idempotencyKey_key" ON "WashSettlement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WashSettlement_batchId_paidAt_idx" ON "WashSettlement"("batchId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNo_key" ON "Customer"("customerNo");

-- AddForeignKey
ALTER TABLE "WashAgreement" ADD CONSTRAINT "WashAgreement_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashAgreement" ADD CONSTRAINT "WashAgreement_washBranchId_fkey" FOREIGN KEY ("washBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashService" ADD CONSTRAINT "WashService_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashService" ADD CONSTRAINT "WashService_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "WashAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashService" ADD CONSTRAINT "WashService_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WashBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashBatch" ADD CONSTRAINT "WashBatch_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "WashAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashSettlement" ADD CONSTRAINT "WashSettlement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WashBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "WashAgreement" ADD CONSTRAINT "WashAgreement_amount_positive" CHECK ("unitAmount" IS NULL OR "unitAmount" > 0);
ALTER TABLE "WashAgreement" ADD CONSTRAINT "WashAgreement_cadence_valid" CHECK ("cadence" IN ('DAILY','WEEKLY','MONTHLY'));
ALTER TABLE "WashService" ADD CONSTRAINT "WashService_amount_positive" CHECK ("amount" IS NULL OR "amount" > 0);
ALTER TABLE "WashService" ADD CONSTRAINT "WashService_status_valid" CHECK ("status" IN ('OPEN','COMPLETED'));
ALTER TABLE "WashBatch" ADD CONSTRAINT "WashBatch_total_positive" CHECK ("total" > 0);
ALTER TABLE "WashBatch" ADD CONSTRAINT "WashBatch_status_valid" CHECK ("status" IN ('SUBMITTED','POSTED','REJECTED'));
ALTER TABLE "WashSettlement" ADD CONSTRAINT "WashSettlement_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "WashSettlement" ADD CONSTRAINT "WashSettlement_source_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WashSettlement" ADD CONSTRAINT "WashSettlement_receipt_fkey" FOREIGN KEY ("receiptTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WashAgreement" ADD CONSTRAINT "WashAgreement_issue_mode_valid" CHECK ("issueMode" IN ('ELIGIBLE','ALL'));
