BEGIN;
-- Preserve the drawer guard; permit only the one-time test-balance operation.
-- This migration changes no balances and creates no financial transactions.
CREATE OR REPLACE FUNCTION ycd_guard_cash_drawer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "FinancialAccount" WHERE id=NEW."accountId" AND "cashRole"='DRAWER') THEN
  IF (
   (NEW.type='CUSTOMER_RECEIPT' AND NEW."relatedEntityType"='Invoice' AND NEW.amount>0) OR
   (NEW.type='CUSTOMER_REFUND' AND NEW."relatedEntityType"='SalesReturn' AND NEW.amount<0) OR
   (NEW.type='TRANSFER_OUT' AND NEW."relatedEntityType"='CashHandover' AND NEW.amount<0) OR
   (NEW.type='TRANSFER_IN' AND NEW."relatedEntityType"='CashFloat' AND NEW.amount>0) OR
   (
    TG_OP='INSERT' AND NEW.type='ADJUSTMENT' AND NEW.amount<0
    AND NEW."relatedEntityType"='TestCashReconciliation'
    AND NEW."relatedEntityId"=NEW."accountId"
    AND NEW.reference='TEST-CASH-RECONCILIATION'
    AND NEW."idempotencyKey"='test-cash-reconciliation:' || NEW."accountId"
    AND EXISTS (
     SELECT 1 FROM "FinancialAccount" a WHERE a.id=NEW."accountId"
     AND a."branchId"=NEW."branchId" AND a.active AND a.type='CASH'
     AND a.code LIKE 'TEST-%' AND a."nameAr" LIKE '%تجريبي%'
    )
    AND NOT EXISTS (SELECT 1 FROM "Shift" s WHERE s."branchId"=NEW."branchId" AND s."closedAt" IS NULL)
    AND NOT EXISTS (SELECT 1 FROM "FinancialTransaction" t WHERE t."accountId"=NEW."accountId" AND t."relatedEntityType"='TestCashReconciliation')
    AND NEW.amount=-(SELECT COALESCE(SUM(t.amount),0) FROM "FinancialTransaction" t WHERE t."accountId"=NEW."accountId")
   )
  ) IS NOT TRUE THEN
   RAISE EXCEPTION 'CASH_DRAWER_RESTRICTED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
