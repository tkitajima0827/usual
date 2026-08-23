-- CreateEnum
CREATE TYPE "ConsumptionTaxCategory" AS ENUM ('TAXABLE', 'EXEMPT', 'OUT_OF_SCOPE');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "consumptionTaxCategory" "ConsumptionTaxCategory" NOT NULL DEFAULT 'TAXABLE';

-- CreateTable
CREATE TABLE "TaxSettings" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "effectiveTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 33.00,
    "lossCarryforward" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "consumptionTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "priorYearCorporateTaxAnnual" DECIMAL(14,2),
    "priorYearConsumptionTaxAnnual" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxSettings_fiscalYearId_key" ON "TaxSettings"("fiscalYearId");

-- AddForeignKey
ALTER TABLE "TaxSettings" ADD CONSTRAINT "TaxSettings_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
