-- Add a shared, concurrency-safe sequence for new document numbers.
CREATE SEQUENCE "YcdDocumentNumber" AS bigint START WITH 1;
CREATE FUNCTION ycd_document_number() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'YCD-' || CASE WHEN length(n) < 4 THEN lpad(n, 4, '0') ELSE n END
  FROM (SELECT nextval('"YcdDocumentNumber"')::text AS n) value;
$$;
-- Existing vouchers keep their previous displayed numbers; only new rows get a number.
ALTER TABLE "FinancialTransaction" ADD COLUMN "documentNo" TEXT;
ALTER TABLE "FinancialTransaction" ALTER COLUMN "documentNo" SET DEFAULT ycd_document_number();
CREATE UNIQUE INDEX "FinancialTransaction_documentNo_key" ON "FinancialTransaction"("documentNo");
-- Preserve request retry protection independently of the human-readable number.
ALTER TABLE "ExpenseRequest" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "ExpenseRequest" SET "idempotencyKey" = "requestNo" WHERE "requestNo" LIKE 'EXP-%';
CREATE UNIQUE INDEX "ExpenseRequest_idempotencyKey_key" ON "ExpenseRequest"("idempotencyKey");
