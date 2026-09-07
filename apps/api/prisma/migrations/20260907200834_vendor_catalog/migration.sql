/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,catalogKey]` on the table `LicenseProduct` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LicenseProduct" ADD COLUMN     "catalogKey" TEXT,
ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LicenseProduct_organizationId_catalogKey_key" ON "LicenseProduct"("organizationId", "catalogKey");
