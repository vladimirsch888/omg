-- CreateTable
CREATE TABLE "SalesPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesPlan_organizationId_year_idx" ON "SalesPlan"("organizationId", "year");

-- AddForeignKey
ALTER TABLE "SalesPlan" ADD CONSTRAINT "SalesPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
