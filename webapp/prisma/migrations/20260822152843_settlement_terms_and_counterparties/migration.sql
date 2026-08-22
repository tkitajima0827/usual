-- CreateEnum
CREATE TYPE "SettlementDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "settlementClosingDay" INTEGER,
ADD COLUMN     "settlementDay" INTEGER,
ADD COLUMN     "settlementMonthsAfter" INTEGER;

-- CreateTable
CREATE TABLE "DefaultSettlementTerm" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "direction" "SettlementDirection" NOT NULL,
    "closingDay" INTEGER NOT NULL DEFAULT 31,
    "monthsAfter" INTEGER NOT NULL DEFAULT 1,
    "settlementDay" INTEGER NOT NULL DEFAULT 31,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultSettlementTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "direction" "SettlementDirection" NOT NULL,
    "closingDay" INTEGER NOT NULL DEFAULT 31,
    "monthsAfter" INTEGER NOT NULL DEFAULT 1,
    "settlementDay" INTEGER NOT NULL DEFAULT 31,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DefaultSettlementTerm_clientId_direction_key" ON "DefaultSettlementTerm"("clientId", "direction");

-- CreateIndex
CREATE INDEX "Counterparty_clientId_idx" ON "Counterparty"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_clientId_name_direction_key" ON "Counterparty"("clientId", "name", "direction");

-- AddForeignKey
ALTER TABLE "DefaultSettlementTerm" ADD CONSTRAINT "DefaultSettlementTerm_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
