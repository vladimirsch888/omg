-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('LICENSE', 'WORK');

-- AlterTable
ALTER TABLE "LicenseProduct" ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'LICENSE',
ALTER COLUMN "defaultDurationMonths" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "workEndDate" TIMESTAMP(3);
