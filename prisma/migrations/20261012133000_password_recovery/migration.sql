ALTER TABLE "User" ADD COLUMN "recoveryWhatsApp" TEXT;
CREATE UNIQUE INDEX "User_recoveryWhatsApp_key" ON "User"("recoveryWhatsApp");
CREATE TABLE "PasswordRecoveryChallenge" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel" TEXT NOT NULL,
  "destinationHash" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "verificationSid" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordRecoveryChallenge_userId_createdAt_idx" ON "PasswordRecoveryChallenge"("userId", "createdAt");
CREATE INDEX "PasswordRecoveryChallenge_expiresAt_idx" ON "PasswordRecoveryChallenge"("expiresAt");
CREATE TABLE "PasswordRecoveryLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PasswordRecoveryLimit_expiresAt_idx" ON "PasswordRecoveryLimit"("expiresAt");
