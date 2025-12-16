-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "defaultPercent" INTEGER NOT NULL DEFAULT 10,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCharity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedCharity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "percentage" INTEGER NOT NULL,
    "maaser" INTEGER NOT NULL,
    "description" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPaymentSnapshot" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "groupOwnerId" TEXT NOT NULL,
    "totalGroupMaaser" INTEGER NOT NULL,
    "totalGroupFixedCharities" INTEGER NOT NULL,
    "groupAmountPaid" INTEGER NOT NULL,
    "memberStates" JSONB NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPaymentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPaymentMember" (
    "id" TEXT NOT NULL,
    "groupPaymentSnapshotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GroupPaymentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedAccess" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FixedCharity_userId_idx" ON "FixedCharity"("userId");

-- CreateIndex
CREATE INDEX "Income_userId_month_idx" ON "Income"("userId", "month");

-- CreateIndex
CREATE INDEX "GroupPaymentSnapshot_groupOwnerId_month_idx" ON "GroupPaymentSnapshot"("groupOwnerId", "month");

-- CreateIndex
CREATE INDEX "GroupPaymentSnapshot_month_idx" ON "GroupPaymentSnapshot"("month");

-- CreateIndex
CREATE INDEX "GroupPaymentMember_userId_idx" ON "GroupPaymentMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPaymentMember_groupPaymentSnapshotId_userId_key" ON "GroupPaymentMember"("groupPaymentSnapshotId", "userId");

-- CreateIndex
CREATE INDEX "SharedAccess_ownerId_idx" ON "SharedAccess"("ownerId");

-- CreateIndex
CREATE INDEX "SharedAccess_viewerId_idx" ON "SharedAccess"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedAccess_ownerId_viewerId_key" ON "SharedAccess"("ownerId", "viewerId");

-- CreateIndex
CREATE INDEX "Partnership_user1Id_idx" ON "Partnership"("user1Id");

-- CreateIndex
CREATE INDEX "Partnership_user2Id_idx" ON "Partnership"("user2Id");

-- CreateIndex
CREATE INDEX "Partnership_status_idx" ON "Partnership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_user1Id_user2Id_key" ON "Partnership"("user1Id", "user2Id");

-- AddForeignKey
ALTER TABLE "FixedCharity" ADD CONSTRAINT "FixedCharity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPaymentSnapshot" ADD CONSTRAINT "GroupPaymentSnapshot_groupOwnerId_fkey" FOREIGN KEY ("groupOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPaymentMember" ADD CONSTRAINT "GroupPaymentMember_groupPaymentSnapshotId_fkey" FOREIGN KEY ("groupPaymentSnapshotId") REFERENCES "GroupPaymentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPaymentMember" ADD CONSTRAINT "GroupPaymentMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedAccess" ADD CONSTRAINT "SharedAccess_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedAccess" ADD CONSTRAINT "SharedAccess_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

