-- CreateEnum
CREATE TYPE "PendingIncomeStatus" AS ENUM ('READING', 'OPEN', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PendingIncome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "mediaGroupId" TEXT,
    "viaImage" BOOLEAN NOT NULL DEFAULT true,
    "cardMessageId" INTEGER,
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "amount" INTEGER,
    "month" TEXT,
    "depositDate" TEXT,
    "dateFromImage" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "percentage" INTEGER,
    "status" "PendingIncomeStatus" NOT NULL DEFAULT 'READING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "incomeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingIncome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingIncome_userId_createdAt_idx" ON "PendingIncome"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingIncome_chatId_cardMessageId_idx" ON "PendingIncome"("chatId", "cardMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingIncome_chatId_sourceMessageId_key" ON "PendingIncome"("chatId", "sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingIncome_chatId_mediaGroupId_key" ON "PendingIncome"("chatId", "mediaGroupId");

-- AddForeignKey
ALTER TABLE "PendingIncome" ADD CONSTRAINT "PendingIncome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

