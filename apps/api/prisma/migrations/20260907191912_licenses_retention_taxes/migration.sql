-- AlterTable
ALTER TABLE "LicenseProduct" ADD COLUMN     "pricePerSeat" DECIMAL(14,2),
ADD COLUMN     "tariffValueId" TEXT,
ADD COLUMN     "vendorValueId" TEXT;

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "taxKind" TEXT,
ADD COLUMN     "taxPeriod" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "accountRef" TEXT,
ADD COLUMN     "cancelComment" TEXT,
ADD COLUMN     "cancelReasonValueId" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "seats" INTEGER;

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "form" TEXT NOT NULL DEFAULT 'IP',
    "regime" TEXT NOT NULL DEFAULT 'USN_INCOME',
    "ratePercent" DECIMAL(5,2) NOT NULL DEFAULT 6,
    "minimumTaxPercent" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "fixedContributions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "onePercentThreshold" DECIMAL(14,2) NOT NULL DEFAULT 300000,
    "onePercentCap" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductFixedWhenDue" BOOLEAN NOT NULL DEFAULT true,
    "hasEmployees" BOOLEAN NOT NULL DEFAULT false,
    "vatThreshold" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_organizationId_key" ON "TaxProfile"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_startDate_idx" ON "Subscription"("organizationId", "startDate");

-- AddForeignKey
ALTER TABLE "LicenseProduct" ADD CONSTRAINT "LicenseProduct_vendorValueId_fkey" FOREIGN KEY ("vendorValueId") REFERENCES "DictionaryValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseProduct" ADD CONSTRAINT "LicenseProduct_tariffValueId_fkey" FOREIGN KEY ("tariffValueId") REFERENCES "DictionaryValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_cancelReasonValueId_fkey" FOREIGN KEY ("cancelReasonValueId") REFERENCES "DictionaryValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill (hand-written, additive only)
-- ---------------------------------------------------------------------------

-- New dictionary sections for every existing organization: vendors, licence
-- tariffs and cancellation reasons (new organizations get them from the seed).
INSERT INTO "DictionaryType" ("id", "organizationId", "code", "name", "description", "isSystem", "createdAt")
SELECT gen_random_uuid(), o."id", d.code, d.name, d.description, true, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('vendor', 'Вендоры', 'Поставщики лицензий, которые вы перепродаёте'),
  ('license_tariff', 'Тарифы лицензий', 'Тарифные планы вендоров'),
  ('cancel_reason', 'Причины отмены подписки', 'Почему клиент отказался от лицензии')
) AS d(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM "DictionaryType" t WHERE t."organizationId" = o."id" AND t."code" = d.code);

INSERT INTO "DictionaryValue" ("id", "dictionaryTypeId", "organizationId", "code", "name", "sortOrder", "isActive")
SELECT gen_random_uuid(), t."id", t."organizationId", d.code, d.name, d.sort, true
FROM "DictionaryType" t
JOIN (VALUES
  ('vendor', 'amocrm', 'amoCRM', 0), ('vendor', 'wazzup', 'Wazzup', 1), ('vendor', 'nova', 'NOVA', 2),
  ('license_tariff', 'basic', 'Базовый', 0), ('license_tariff', 'advanced', 'Расширенный', 1), ('license_tariff', 'professional', 'Профессиональный', 2),
  ('cancel_reason', 'price', 'Дорого', 0), ('cancel_reason', 'competitor', 'Ушёл к конкуренту', 1), ('cancel_reason', 'closed', 'Закрыл бизнес', 2),
  ('cancel_reason', 'unused', 'Не пользовался', 3), ('cancel_reason', 'tariff_change', 'Перешёл на другой тариф / продукт', 4), ('cancel_reason', 'other', 'Прочее', 5)
) AS d(type_code, code, name, sort) ON d.type_code = t."code"
WHERE NOT EXISTS (SELECT 1 FROM "DictionaryValue" v WHERE v."dictionaryTypeId" = t."id" AND v."code" = d.code);

-- Existing licence products: derive the vendor from the operation category
-- they were seeded with (license_amocrm → amoCRM, etc.).
UPDATE "LicenseProduct" p
SET "vendorValueId" = vv."id"
FROM "DictionaryValue" cv
JOIN "DictionaryType" ct ON ct."id" = cv."dictionaryTypeId" AND ct."code" = 'operation_category'
JOIN "DictionaryType" vt ON vt."organizationId" = cv."organizationId" AND vt."code" = 'vendor'
JOIN "DictionaryValue" vv ON vv."dictionaryTypeId" = vt."id"
  AND vv."code" = CASE cv."code" WHEN 'license_amocrm' THEN 'amocrm' WHEN 'license_wazzup' THEN 'wazzup' WHEN 'license_nova' THEN 'nova' END
WHERE p."categoryValueId" = cv."id" AND p."vendorValueId" IS NULL AND p."type" = 'LICENSE';

-- The "taxes" operation category gets a stable systemKey so tax payments
-- booked from the calendar land in it whatever it is renamed to.
UPDATE "DictionaryValue" v
SET "systemKey" = 'taxes'
FROM "DictionaryType" t
WHERE v."dictionaryTypeId" = t."id" AND t."code" = 'operation_category' AND v."code" = 'taxes' AND v."systemKey" IS NULL;

-- Existing cancelled subscriptions: without a recorded date, the best
-- estimate is the last change we know of — the next billing date they never
-- reached. Editable afterwards.
UPDATE "Subscription" SET "cancelledAt" = "nextBillingDate" WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;
UPDATE "Subscription" SET "pausedAt" = "nextBillingDate" WHERE "status" = 'PAUSED' AND "pausedAt" IS NULL;
