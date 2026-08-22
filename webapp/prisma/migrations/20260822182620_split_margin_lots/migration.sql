/*
  Warnings:

  - You are about to drop the column `marginBookValue` on the `OpeningBalance` table. All the data in the column will be lost.
  - You are about to drop the column `marginQuantity` on the `OpeningBalance` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpeningBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "spotQuantity" INTEGER NOT NULL DEFAULT 0,
    "spotBookValue" INTEGER NOT NULL DEFAULT 0,
    "marginLongQuantity" INTEGER NOT NULL DEFAULT 0,
    "marginLongBookValue" INTEGER NOT NULL DEFAULT 0,
    "marginShortQuantity" INTEGER NOT NULL DEFAULT 0,
    "marginShortBookValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OpeningBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpeningBalance_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpeningBalance_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpeningBalance" ("businessId", "fiscalPeriodId", "id", "securityId", "spotBookValue", "spotQuantity") SELECT "businessId", "fiscalPeriodId", "id", "securityId", "spotBookValue", "spotQuantity" FROM "OpeningBalance";
DROP TABLE "OpeningBalance";
ALTER TABLE "new_OpeningBalance" RENAME TO "OpeningBalance";
CREATE UNIQUE INDEX "OpeningBalance_fiscalPeriodId_securityId_key" ON "OpeningBalance"("fiscalPeriodId", "securityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
