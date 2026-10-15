ALTER TABLE "Invoice" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN "correctionOfId" TEXT, ADD COLUMN "correctionReason" TEXT;
CREATE UNIQUE INDEX "Invoice_correctionOfId_key" ON "Invoice"("correctionOfId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_documentType_check" CHECK (
("documentType" = 'INVOICE' AND "correctionOfId" IS NULL) OR
("documentType" = 'DEBIT_NOTE' AND "correctionOfId" IS NOT NULL AND "correctionReason" IS NOT NULL));

ALTER TABLE "ServiceOrderItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,6);
