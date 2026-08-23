import prisma from "@/lib/prisma";

export interface MonthlyTotal {
  month: string;
  bookValue: number;
  marketValue: number | null;
  monthlyValuationGain: number | null;
  cumulativeValuationGain: number | null;
  monthlyRealizedGain: number;
  cumulativeRealizedGain: number;
}

function monthRange(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor.getTime() <= last.getTime()) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * 会計期間内の各月について、現物保有の帳簿価額合計・評価額合計(入力済みの場合)・
 * 評価損益(単月/累計)・売買(実現)損益(単月/累計)を算出する。ダッシュボードの推移
 * グラフ用。
 *
 * 評価損益は月末時価評価が「取得価額との差額」という時点のスナップショットとして
 * 保存されているため、その値自体を累計評価損益として扱い、前回の評価入力月からの
 * 差分を単月評価損益とする(未入力の月はnull、前回入力月からの純粋な変動を表す)。
 * 一方、売買損益は取引が発生した月ごとに実現するフローなので、その月に発生した分を
 * 単月売買損益、期首からの合計を累計売買損益とする。
 */
export async function getMonthlyTotals(
  businessId: string,
  fiscalPeriodId: string,
  fiscalPeriod: { startDate: Date; endDate: Date },
): Promise<MonthlyTotal[]> {
  const now = new Date();
  const effectiveEnd = fiscalPeriod.endDate < now ? fiscalPeriod.endDate : now;
  const months = monthRange(fiscalPeriod.startDate, effectiveEnd);

  const [spotLedgerEntries, allLedgerEntries, valuations, openingBalances] = await Promise.all([
    prisma.costLedgerEntry.findMany({
      where: { businessId, fiscalPeriodId, lotType: "SPOT" },
      include: { trade: true },
      orderBy: [{ trade: { tradeDate: "asc" } }, { createdAt: "asc" }],
    }),
    // 実現損益は現物(SPOT)だけでなく信用の返済取引(MARGIN_LONG/MARGIN_SHORT)でも発生するため、
    // 累積実現損益はロット種別を問わず全件から集計する。
    prisma.costLedgerEntry.findMany({
      where: { businessId, fiscalPeriodId, realizedGain: { not: null } },
      include: { trade: true },
      orderBy: [{ trade: { tradeDate: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.valuation.findMany({ where: { businessId, fiscalPeriodId } }),
    prisma.openingBalance.findMany({ where: { businessId, fiscalPeriodId } }),
  ]);

  const valuationByMonth = new Map<string, number>();
  for (const v of valuations) {
    valuationByMonth.set(v.month, (valuationByMonth.get(v.month) ?? 0) + v.marketValue);
  }

  const results: MonthlyTotal[] = [];
  let cumulativeRealizedGain = 0;
  let previousCumulativeValuationGain = 0;
  let spotCursor = 0;
  let gainCursor = 0;
  // securityId -> latest known bookValue as of the current iteration point
  const bookValueBySecurity = new Map<string, number>();
  for (const ob of openingBalances) {
    if (ob.spotQuantity !== 0) {
      bookValueBySecurity.set(ob.securityId, ob.spotBookValue);
    }
  }

  for (const month of months) {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    while (
      spotCursor < spotLedgerEntries.length &&
      spotLedgerEntries[spotCursor].trade.tradeDate.getTime() <= monthEnd.getTime()
    ) {
      const entry = spotLedgerEntries[spotCursor];
      bookValueBySecurity.set(entry.securityId, Math.round(entry.bookValueAfter));
      spotCursor++;
    }

    let monthlyRealizedGain = 0;
    while (
      gainCursor < allLedgerEntries.length &&
      allLedgerEntries[gainCursor].trade.tradeDate.getTime() <= monthEnd.getTime()
    ) {
      monthlyRealizedGain += allLedgerEntries[gainCursor].realizedGain ?? 0;
      gainCursor++;
    }
    cumulativeRealizedGain += monthlyRealizedGain;

    const bookValue = [...bookValueBySecurity.values()].reduce((sum, v) => sum + v, 0);
    const marketValue = valuationByMonth.get(month) ?? null;

    let monthlyValuationGain: number | null = null;
    let cumulativeValuationGain: number | null = null;
    if (marketValue !== null) {
      cumulativeValuationGain = marketValue - bookValue;
      monthlyValuationGain = cumulativeValuationGain - previousCumulativeValuationGain;
      previousCumulativeValuationGain = cumulativeValuationGain;
    }

    results.push({
      month,
      bookValue,
      marketValue,
      monthlyValuationGain: monthlyValuationGain !== null ? Math.round(monthlyValuationGain) : null,
      cumulativeValuationGain: cumulativeValuationGain !== null ? Math.round(cumulativeValuationGain) : null,
      monthlyRealizedGain: Math.round(monthlyRealizedGain),
      cumulativeRealizedGain: Math.round(cumulativeRealizedGain),
    });
  }

  return results;
}
