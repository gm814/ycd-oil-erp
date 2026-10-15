-- Permit the internal financial container used by linked debit notes.
-- Keep the channel allowlist for all other service orders.
BEGIN;
ALTER TABLE "ServiceOrder" DROP CONSTRAINT "ServiceOrder_channel_valid";
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_channel_valid"
  CHECK ("channel" IN ('OIL', 'WASH', 'PRICE_CORRECTION'));
COMMIT;
