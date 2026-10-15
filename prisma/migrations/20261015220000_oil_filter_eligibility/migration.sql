ALTER TABLE "Product" ADD COLUMN "isOilFilter" BOOLEAN NOT NULL DEFAULT false;
-- Identify explicitly named oil filters in the existing catalog, never air/cabin filters.
UPDATE "Product" SET "isOilFilter" = true WHERE "category" = 'FILTER'
  AND ("nameAr" ~* '(فلتر[[:space:]]*(ال)?زيت|سيفون|oil[[:space:]-]*filter)');
UPDATE "WashAgreement" SET "issueMode" = 'ELIGIBLE' WHERE "issueMode" = 'ALL';
