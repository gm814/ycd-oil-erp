CREATE TABLE "OfflineReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfflineReceipt_userId_branchId_createdAt_idx" ON "OfflineReceipt"("userId", "branchId", "createdAt");
