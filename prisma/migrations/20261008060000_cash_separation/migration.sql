BEGIN;
ALTER TABLE "FinancialAccount" ADD COLUMN "cashRole" TEXT;
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_cashRole_check"
 CHECK ("cashRole" IS NULL OR ("cashRole" IN ('DRAWER', 'TREASURY') AND "type" = 'CASH'));
CREATE UNIQUE INDEX "FinancialAccount_branchId_cashRole_key" ON "FinancialAccount"("branchId", "cashRole");
ALTER TABLE "Shift" ADD COLUMN "drawerAccountId" TEXT;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_drawerAccountId_fkey" FOREIGN KEY ("drawerAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Enforce the drawer restriction for every posting path, including payroll/custody.
-- Existing rows remain unchanged; historical disbursements remain auditable.
CREATE FUNCTION ycd_guard_cash_drawer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "FinancialAccount" WHERE id=NEW."accountId" AND "cashRole"='DRAWER') THEN
  IF (
   (NEW.type='CUSTOMER_RECEIPT' AND NEW."relatedEntityType"='Invoice' AND NEW.amount>0) OR
   (NEW.type='CUSTOMER_REFUND' AND NEW."relatedEntityType"='SalesReturn' AND NEW.amount<0) OR
   (NEW.type='TRANSFER_OUT' AND NEW."relatedEntityType"='CashHandover' AND NEW.amount<0) OR
   (NEW.type='TRANSFER_IN' AND NEW."relatedEntityType"='CashFloat' AND NEW.amount>0)
  ) IS NOT TRUE THEN
   RAISE EXCEPTION 'CASH_DRAWER_RESTRICTED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FinancialTransaction_cash_drawer_guard" BEFORE INSERT OR UPDATE ON "FinancialTransaction"
 FOR EACH ROW EXECUTE FUNCTION ycd_guard_cash_drawer();
COMMIT;
