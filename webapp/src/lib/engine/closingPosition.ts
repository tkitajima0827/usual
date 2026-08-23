import prisma from "@/lib/prisma";

export interface ClosingPositionRow {
  securityId: string;
  code: string;
  name: string;
  spotQuantity: number;
  spotBookValue: number;
  marginLongQuantity: number;
  marginLongBookValue: number;
  marginShortQuantity: number;
  marginShortBookValue: number;
}

/**
 * 指定した会計期間の期末時点(=その期間の最終取引後)の残高を、
 * 現物・信用買建・信用売建それぞれについて算出する。
 * 当期に取引がない銘柄は、その期間の期首残高をそのまま使用する。
 */
export async function getClosingPosition(
  businessId: string,
  fiscalPeriodId: string,
): Promise<ClosingPositionRow[]> {
  const [openingBalances, entries] = await Promise.all([
    prisma.openingBalance.findMany({
      where: { businessId, fiscalPeriodId },
      include: { security: true },
    }),
    prisma.costLedgerEntry.findMany({
      where: { businessId, fiscalPeriodId },
      include: { security: true },
      orderBy: [{ trade: { tradeDate: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  const result = new Map<string, ClosingPositionRow>();

  for (const ob of openingBalances) {
    result.set(ob.securityId, {
      securityId: ob.securityId,
      code: ob.security.code,
      name: ob.security.name,
      spotQuantity: ob.spotQuantity,
      spotBookValue: ob.spotBookValue,
      marginLongQuantity: ob.marginLongQuantity,
      marginLongBookValue: ob.marginLongBookValue,
      marginShortQuantity: ob.marginShortQuantity,
      marginShortBookValue: ob.marginShortBookValue,
    });
  }

  for (const entry of entries) {
    const row: ClosingPositionRow =
      result.get(entry.securityId) ?? {
        securityId: entry.securityId,
        code: entry.security.code,
        name: entry.security.name,
        spotQuantity: 0,
        spotBookValue: 0,
        marginLongQuantity: 0,
        marginLongBookValue: 0,
        marginShortQuantity: 0,
        marginShortBookValue: 0,
      };

    if (entry.lotType === "SPOT") {
      row.spotQuantity = entry.quantityAfter;
      row.spotBookValue = Math.round(entry.bookValueAfter);
    } else if (entry.lotType === "MARGIN_LONG") {
      row.marginLongQuantity = entry.quantityAfter;
      row.marginLongBookValue = Math.round(entry.bookValueAfter);
    } else if (entry.lotType === "MARGIN_SHORT") {
      row.marginShortQuantity = entry.quantityAfter;
      row.marginShortBookValue = Math.round(entry.bookValueAfter);
    }
    result.set(entry.securityId, row);
  }

  return [...result.values()]
    .filter((r) => r.spotQuantity !== 0 || r.marginLongQuantity !== 0 || r.marginShortQuantity !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}
