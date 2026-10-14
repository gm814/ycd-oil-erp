ALTER TABLE "Product" ADD COLUMN "costBasedPricing" BOOLEAN NOT NULL DEFAULT false;

-- Apply the approved policy only to untouched catalog-import drafts, never
-- to existing active products, stock balances, or historical invoice lines.
WITH imported AS (
  SELECT DISTINCT jsonb_array_elements_text("afterJson"->'skus') AS sku
  FROM "AuditLog"
  WHERE action = 'PRODUCT_CATALOG_IMPORTED'
    AND "afterJson"->>'mode' = 'INACTIVE_CATALOG_ONLY'
), candidates AS (
  SELECT p.* FROM "Product" p JOIN imported i ON i.sku = p.sku
  WHERE NOT p.active AND p."salePrice" = 0 AND p."costPrice" > 0
), updated AS (
  UPDATE "Product" p SET
    "costBasedPricing" = true,
    "salePrice" = ceil(p."costPrice" * 1.25 * 100) / 100,
    active = true,
    "serviceIntervalKm" = CASE
      WHEN p.category <> 'OIL' OR p."serviceIntervalKm" IS NOT NULL THEN p."serviceIntervalKm"
      WHEN p."nameAr" ~* '(^|[^0-9])(10[[:space:]]*[wW]?[[:space:]]*[-/][[:space:]]*30|20[[:space:]]*[wW]?[[:space:]]*[-/][[:space:]]*50)([^0-9]|$)' THEN 5000
      WHEN p."nameAr" ~* '(^|[^0-9])(5[[:space:]]*[wW]?[[:space:]]*[-/][[:space:]]*30|10[[:space:]]*[wW]?[[:space:]]*[-/][[:space:]]*40)([^0-9]|$)' THEN 10000
      ELSE NULL END,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM candidates c WHERE p.id = c.id
  RETURNING p.id, p.sku, p."salePrice", p."serviceIntervalKm"
)
INSERT INTO "AuditLog" (id, action, "entityType", "beforeJson", "afterJson", "createdAt")
SELECT 'catalog-pricing-' || md5(random()::text), 'PRODUCT_PRICING_POLICY_APPLIED', 'Product',
  (SELECT jsonb_agg(jsonb_build_object('id',id,'active',active,'salePrice',"salePrice",'serviceIntervalKm',"serviceIntervalKm")) FROM candidates),
  jsonb_build_object('minimumMarkupPercent',25,'maximumMarkupPercent',500,'products',jsonb_agg(to_jsonb(updated))), CURRENT_TIMESTAMP
FROM updated HAVING count(*) > 0;
