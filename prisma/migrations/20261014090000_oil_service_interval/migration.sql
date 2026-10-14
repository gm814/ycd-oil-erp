ALTER TABLE "Product" ADD COLUMN "serviceIntervalKm" INTEGER;
ALTER TABLE "Product" ADD CONSTRAINT "Product_serviceIntervalKm_check"
CHECK ("serviceIntervalKm" IS NULL OR ("category" = 'OIL' AND "serviceIntervalKm" IN (5000, 10000)));
