CREATE TABLE "AccountRecoveryToken" (
  "tokenHash" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AccountRecoveryToken_userId_idx" ON "AccountRecoveryToken"("userId");
CREATE TABLE "RecoveryRateLimit" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL
);
