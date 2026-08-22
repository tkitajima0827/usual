import prisma from "@/lib/prisma";

export interface SpotPositionRow {
  securityId: string;
  code: string;
  name: string;
  quantity: number;
  bookValue: number;
}

function monthEndDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  // 翌月1日の直前 = 当月末日 (UTC基準で保存しているため23:59:59.999まで含める)
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

/**
 * 指定月末時点でのスポット(現物/売買目的有価証券)ポジションを算出する。
 * 当期の取引がない銘柄は期首残高をそのまま使用する。
 */
export async function getSpotPositionAsOfMonth(
  businessId: string,
  fiscalPeriodId: string,
  month: string,
): Promise<SpotPositionRow[]> {
  const cutoff = monthEndDate(month);

  const [openingBalances, entries] = await Promise.all([
    prisma.openingBalance.findMany({
      where: { businessId, fiscalPeriodId },
      include: { security: true },
    }),
    prisma.costLedgerEntry.findMany({
      where: {
        businessId,
        fiscalPeriodId,
        lotType: "SPOT",
        trade: { tradeDate: { lte: cutoff } },
      },
      include: { security: true, trade: true },
      orderBy: [{ trade: { tradeDate: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  const result = new Map<string, SpotPositionRow>();

  for (const ob of openingBalances) {
    if (ob.spotQuantity === 0) continue;
    result.set(ob.securityId, {
      securityId: ob.securityId,
      code: ob.security.code,
      name: ob.security.name,
      quantity: ob.spotQuantity,
      bookValue: ob.spotBookValue,
    });
  }

  for (const entry of entries) {
    result.set(entry.securityId, {
      securityId: entry.securityId,
      code: entry.security.code,
      name: entry.security.name,
      quantity: entry.quantityAfter,
      bookValue: Math.round(entry.bookValueAfter),
    });
  }

  return [...result.values()]
    .filter((r) => r.quantity !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}
