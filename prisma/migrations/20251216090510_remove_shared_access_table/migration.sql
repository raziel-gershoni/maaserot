/*
  Warnings:

  - You are about to drop the `SharedAccess` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SharedAccess" DROP CONSTRAINT "SharedAccess_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "SharedAccess" DROP CONSTRAINT "SharedAccess_viewerId_fkey";

-- DropTable
DROP TABLE "SharedAccess";
