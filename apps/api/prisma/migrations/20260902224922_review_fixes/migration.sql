-- AlterTable
ALTER TABLE "DictionaryValue" ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "accountValueId" TEXT,
ADD COLUMN     "taxPayment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entity_entityId_idx" ON "AuditLog"("organizationId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "DictionaryValue_organizationId_systemKey_idx" ON "DictionaryValue"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "Operation_accountValueId_idx" ON "Operation"("accountValueId");

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_accountValueId_fkey" FOREIGN KEY ("accountValueId") REFERENCES "DictionaryValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill (hand-written, additive only)
-- ---------------------------------------------------------------------------

-- Mark every organization's existing "license_cost" operation category with
-- the stable systemKey the code now looks vendor payouts up by.
UPDATE "DictionaryValue" v
SET "systemKey" = 'vendor_cost'
FROM "DictionaryType" t
WHERE v."dictionaryTypeId" = t."id"
  AND t."code" = 'operation_category'
  AND v."code" = 'license_cost'
  AND v."systemKey" IS NULL;

-- Give every existing organization the "account" dictionary section (bank
-- accounts / cash boxes) that new organizations get from the seed, with the
-- same default values, so the operation form has something to offer at once.
INSERT INTO "DictionaryType" ("id", "organizationId", "code", "name", "description", "isSystem", "createdAt")
SELECT gen_random_uuid(), o."id", 'account', 'Счета и кассы', 'Расчётные счета, карты и кассы, через которые проходят деньги', true, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "DictionaryType" t WHERE t."organizationId" = o."id" AND t."code" = 'account'
);

INSERT INTO "DictionaryValue" ("id", "dictionaryTypeId", "organizationId", "code", "name", "sortOrder", "isActive")
SELECT gen_random_uuid(), t."id", t."organizationId", d.code, d.name, d.sort, true
FROM "DictionaryType" t
CROSS JOIN (VALUES ('main_account', 'Основной расчётный счёт', 0), ('card', 'Карта', 1), ('cash', 'Касса', 2)) AS d(code, name, sort)
WHERE t."code" = 'account'
  AND NOT EXISTS (
    SELECT 1 FROM "DictionaryValue" v WHERE v."dictionaryTypeId" = t."id" AND v."code" = d.code
  );
