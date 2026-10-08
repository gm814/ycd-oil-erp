-- CreateTable
CREATE TABLE "MedadConnection" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "captureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionId" TEXT,
    "medadBranch" INTEGER,
    "fiscalYear" TEXT NOT NULL DEFAULT '',
    "warehouseNo" TEXT,
    "costCenterNo" TEXT,
    "salesmanId" TEXT,
    "invoiceAuthority" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedadConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedadMapping" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedadMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedadOutbox" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "revision" INTEGER,
    "sourceHash" TEXT,
    "payload" JSONB,
    "issues" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedadOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedadConnection_branchId_key" ON "MedadConnection"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "MedadMapping_branchId_kind_localId_key" ON "MedadMapping"("branchId", "kind", "localId");

-- CreateIndex
CREATE INDEX "MedadOutbox_branchId_status_capturedAt_idx" ON "MedadOutbox"("branchId", "status", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedadOutbox_branchId_kind_sourceId_key" ON "MedadOutbox"("branchId", "kind", "sourceId");

-- AddForeignKey
ALTER TABLE "MedadConnection" ADD CONSTRAINT "MedadConnection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedadMapping" ADD CONSTRAINT "MedadMapping_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedadOutbox" ADD CONSTRAINT "MedadOutbox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MedadConnection" ADD CONSTRAINT "MedadConnection_authority_valid" CHECK ("invoiceAuthority" IN ('UNCONFIRMED','MEDAD','YCD'));
ALTER TABLE "MedadConnection" ADD CONSTRAINT "MedadConnection_revision_valid" CHECK ("revision" > 0);
ALTER TABLE "MedadMapping" ADD CONSTRAINT "MedadMapping_kind_valid" CHECK ("kind" IN ('CUSTOMER','PRODUCT','UNIT','PAYMENT_METHOD','VAT','ACCOUNT'));
ALTER TABLE "MedadOutbox" ADD CONSTRAINT "MedadOutbox_kind_valid" CHECK ("kind" IN ('INVOICE','PAYMENT','RETURN','WASH_CLAIM','WASH_SETTLEMENT'));
ALTER TABLE "MedadOutbox" ADD CONSTRAINT "MedadOutbox_status_valid" CHECK ("status" IN ('CAPTURED','PREPARED','NEEDS_DATA','NOT_SUPPORTED'));
INSERT INTO "Permission" (id,code) VALUES ('permission-integration-manage','integration.manage'),('permission-integration-view','integration.view') ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE (r.code IN ('GENERAL_MANAGER','FINANCE_MANAGER') AND p.code IN ('integration.manage','integration.view')) OR (r.code='GENERAL_ACCOUNTANT' AND p.code='integration.view') ON CONFLICT DO NOTHING;
