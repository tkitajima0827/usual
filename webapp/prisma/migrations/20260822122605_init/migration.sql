-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FIRM_ADMIN', 'FIRM_STAFF', 'CLIENT_ADMIN', 'CLIENT_USER');

-- CreateEnum
CREATE TYPE "TaxAccountingMethod" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "Statement" AS ENUM ('PL', 'BS', 'CF');

-- CreateEnum
CREATE TYPE "PLCategory" AS ENUM ('REVENUE', 'COGS', 'SGA', 'NON_OPERATING_INCOME', 'NON_OPERATING_EXPENSE', 'EXTRAORDINARY_INCOME', 'EXTRAORDINARY_LOSS', 'INCOME_TAXES');

-- CreateEnum
CREATE TYPE "CalcMethod" AS ENUM ('PREV_YEAR_SAME', 'LINKED', 'DIRECT', 'PAST_AVERAGE');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "taxMethod" "TaxAccountingMethod" NOT NULL DEFAULT 'EXCLUSIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statement" "Statement" NOT NULL DEFAULT 'PL',
    "plCategory" "PLCategory",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyActual" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "MonthlyActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "calcMethod" "CalcMethod" NOT NULL,
    "linkedAccountId" TEXT,
    "linkedPercentage" DECIMAL(7,4),

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDirectValue" (
    "id" TEXT NOT NULL,
    "planEntryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PlanDirectValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE INDEX "Account_clientId_idx" ON "Account"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_clientId_code_key" ON "Account"("clientId", "code");

-- CreateIndex
CREATE INDEX "MonthlyActual_clientId_year_month_idx" ON "MonthlyActual"("clientId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyActual_accountId_year_month_key" ON "MonthlyActual"("accountId", "year", "month");

-- CreateIndex
CREATE INDEX "FiscalYear_clientId_idx" ON "FiscalYear"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_clientId_startYear_startMonth_key" ON "FiscalYear"("clientId", "startYear", "startMonth");

-- CreateIndex
CREATE INDEX "PlanEntry_linkedAccountId_idx" ON "PlanEntry"("linkedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_fiscalYearId_accountId_key" ON "PlanEntry"("fiscalYearId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDirectValue_planEntryId_year_month_key" ON "PlanDirectValue"("planEntryId", "year", "month");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyActual" ADD CONSTRAINT "MonthlyActual_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyActual" ADD CONSTRAINT "MonthlyActual_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDirectValue" ADD CONSTRAINT "PlanDirectValue_planEntryId_fkey" FOREIGN KEY ("planEntryId") REFERENCES "PlanEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
