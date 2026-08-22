import prisma from "@/lib/prisma";
import { JournalSourceType } from "@/generated/prisma/enums";
import { getSpotPositionAsOfMonth } from "./spotPosition";

const VALUATION_GAIN_ACCOUNT = "有価証券評価損益";
const SPOT_ASSET_ACCOUNT = "売買目的有価証券";

/**
 * 指定月の月末時価評価(Valuation)と評価損益の仕訳(JournalEntry)を、
 * 既に登録済みのMonthEndPriceを使って再計算する。
 * 対象月の既存Valuation/評価仕訳は洗い替える。
 */
export async function recomputeValuation(businessId: string, fiscalPeriodId: string, month: string) {
  const positions = await getSpotPositionAsOfMonth(businessId, fiscalPeriodId, month);
  const prices = await prisma.monthEndPrice.findMany({
    where: { businessId, fiscalPeriodId, month },
  });
  const priceMap = new Map(prices.map((p) => [p.securityId, p.unitPrice]));

  const securities = await prisma.security.findMany({
    where: { id: { in: positions.map((p) => p.securityId) } },
  });
  const securityMap = new Map(securities.map((s) => [s.id, s]));

  const valuationRows: {
    businessId: string;
    fiscalPeriodId: string;
    securityId: string;
    month: string;
    quantity: number;
    bookValue: number;
    unitPrice: number;
    marketValue: number;
    gainLoss: number;
  }[] = [];

  const journalRows: {
    businessId: string;
    fiscalPeriodId: string;
    month: string;
    date: Date;
    debitAccount: string;
    debitSubAccount: string | null;
    debitAmount: number;
    creditAccount: string;
    creditSubAccount: string | null;
    creditAmount: number;
    memo: string;
    sourceType: JournalSourceType;
  }[] = [];

  const monthEndDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));

  for (const pos of positions) {
    const unitPrice = priceMap.get(pos.securityId);
    if (unitPrice === undefined) continue;

    const marketValue = Math.round(pos.quantity * unitPrice);
    const gainLoss = marketValue - pos.bookValue;
    const security = securityMap.get(pos.securityId);
    const subAccount = security?.name ?? pos.name;

    valuationRows.push({
      businessId,
      fiscalPeriodId,
      securityId: pos.securityId,
      month,
      quantity: pos.quantity,
      bookValue: pos.bookValue,
      unitPrice,
      marketValue,
      gainLoss,
    });

    if (gainLoss !== 0) {
      const memo = `${subAccount}　月末時価評価（${month}）`;
      journalRows.push({
        businessId,
        fiscalPeriodId,
        month,
        date: monthEndDate,
        debitAccount: gainLoss > 0 ? SPOT_ASSET_ACCOUNT : VALUATION_GAIN_ACCOUNT,
        debitSubAccount: gainLoss > 0 ? subAccount : null,
        debitAmount: Math.abs(gainLoss),
        creditAccount: gainLoss > 0 ? VALUATION_GAIN_ACCOUNT : SPOT_ASSET_ACCOUNT,
        creditSubAccount: gainLoss > 0 ? null : subAccount,
        creditAmount: Math.abs(gainLoss),
        memo,
        sourceType: JournalSourceType.VALUATION,
      });
    }
  }

  await prisma.$transaction([
    prisma.valuation.deleteMany({ where: { businessId, fiscalPeriodId, month } }),
    prisma.journalEntry.deleteMany({
      where: { businessId, fiscalPeriodId, month, sourceType: JournalSourceType.VALUATION },
    }),
    ...valuationRows.map((v) => prisma.valuation.create({ data: v })),
    ...(journalRows.length > 0 ? [prisma.journalEntry.createMany({ data: journalRows })] : []),
  ]);

  return { valuationCount: valuationRows.length, journalCount: journalRows.length };
}
