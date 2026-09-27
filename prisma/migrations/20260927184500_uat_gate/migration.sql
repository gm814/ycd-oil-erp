CREATE TYPE "UatStatus" AS ENUM ('NOT_RUN', 'PASSED', 'FAILED');

CREATE TABLE "UatTestResult" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "caseCode" TEXT NOT NULL,
    "status" "UatStatus" NOT NULL DEFAULT 'NOT_RUN',
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "evidenceRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UatTestResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UatTestResult_branchId_caseCode_key" ON "UatTestResult"("branchId", "caseCode");
CREATE INDEX "UatTestResult_branchId_status_updatedAt_idx" ON "UatTestResult"("branchId", "status", "updatedAt");

ALTER TABLE "UatTestResult"
ADD CONSTRAINT "UatTestResult_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
