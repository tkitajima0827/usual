import prisma from "@/lib/prisma";
import { JournalSourceType, LotType } from "@/generated/prisma/enums";
import {
  processSecurityTrades,
  emptyPosition,
  type EngineTrade,
  type SecurityPosition,
} from "./costEngine";
import { buildJournalLines } from "./journalRules";
import { buildTradeMemo } from "./transactionLabels";

export const DEFAULT_CASH_SUB_ACCOUNT = "㈱SBI証券・証券口座";

export interface RecomputeSummary {
  securityCount: number;
  tradeCount: number;
  journalLineCount: number;
  warnings: string[];
}

/**
 * 指定した事業者・会計期間の全銘柄について、期首残高と取引履歴から
 * 原価台帳(CostLedgerEntry)と取引起因の仕訳(JournalEntry)を再計算する。
 * 取込のたびに冪等に呼び出せるよう、対象期間の既存レコードを洗い替える。
 */
export async function recomputeFiscalPeriod(
  businessId: string,
  fiscalPeriodId: string,
): Promise<RecomputeSummary> {
  const [openingBalances, trades] = await Promise.all([
    prisma.openingBalance.findMany({
      where: { businessId, fiscalPeriodId },
    }),
    prisma.trade.findMany({
      where: { businessId, fiscalPeriodId },
      include: { security: true },
      orderBy: { tradeDate: "asc" },
    }),
  ]);

  const openingBySecurity = new Map(openingBalances.map((ob) => [ob.securityId, ob]));

  const tradesBySecurity = new Map<string, typeof trades>();
  for (const trade of trades) {
    const list = tradesBySecurity.get(trade.securityId) ?? [];
    list.push(trade);
    tradesBySecurity.set(trade.securityId, list);
  }

  const warnings: string[] = [];
  const ledgerRows: Array<{
    businessId: string;
    fiscalPeriodId: string;
    securityId: string;
    tradeId: string;
    lotType: LotType;
    quantityDelta: number;
    quantityAfter: number;
    avgUnitCostAfter: number;
    bookValueAfter: number;
    realizedGain: number | null;
  }> = [];
  const journalRows: Array<{
    businessId: string;
    fiscalPeriodId: string;
    tradeId: string;
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
  }> = [];

  for (const [securityId, securityTrades] of tradesBySecurity) {
    const security = securityTrades[0].security;
    const opening = openingBySecurity.get(securityId);
    const startPosition: SecurityPosition = opening
      ? {
          spot: { quantity: opening.spotQuantity, bookValue: opening.spotBookValue },
          marginLong: {
            quantity: opening.marginLongQuantity,
            bookValue: opening.marginLongBookValue,
          },
          marginShort: {
            quantity: opening.marginShortQuantity,
            bookValue: opening.marginShortBookValue,
          },
        }
      : emptyPosition();

    const engineTrades: EngineTrade[] = securityTrades.map((t) => ({
      id: t.id,
      tradeDate: t.tradeDate,
      transactionType: t.transactionType,
      quantity: t.quantity,
      unitPrice: t.unitPrice,
      fee: t.fee,
    }));

    const { steps, warnings: securityWarnings } = processSecurityTrades(
      startPosition,
      engineTrades,
      security.name,
    );
    warnings.push(...securityWarnings);

    const stepsByTrade = new Map<string, typeof steps>();
    for (const step of steps) {
      const list = stepsByTrade.get(step.tradeId) ?? [];
      list.push(step);
      stepsByTrade.set(step.tradeId, list);

      ledgerRows.push({
        businessId,
        fiscalPeriodId,
        securityId,
        tradeId: step.tradeId,
        lotType: step.lotType,
        quantityDelta: step.quantityDelta,
        quantityAfter: step.quantityAfter,
        avgUnitCostAfter: step.avgUnitCostAfter,
        bookValueAfter: step.bookValueAfter,
        realizedGain: step.realizedGain,
      });
    }

    for (const trade of securityTrades) {
      const tradeSteps = stepsByTrade.get(trade.id) ?? [];
      const memo = buildTradeMemo(security.name, trade.transactionType, trade.quantity, trade.unitPrice);
      const lines = buildJournalLines(
        {
          transactionType: trade.transactionType,
          quantity: trade.quantity,
          unitPrice: trade.unitPrice,
          fee: trade.fee,
          securityName: security.name,
          memo,
          cashSubAccount: DEFAULT_CASH_SUB_ACCOUNT,
        },
        tradeSteps,
      );

      const month = monthKeyOf(trade.tradeDate);
      for (const l of lines) {
        journalRows.push({
          businessId,
          fiscalPeriodId,
          tradeId: trade.id,
          month,
          date: trade.tradeDate,
          debitAccount: l.debitAccount,
          debitSubAccount: l.debitSubAccount,
          debitAmount: l.debitAmount,
          creditAccount: l.creditAccount,
          creditSubAccount: l.creditSubAccount,
          creditAmount: l.creditAmount,
          memo: l.memo,
          sourceType: JournalSourceType.TRADE,
        });
      }
    }
  }

  await prisma.$transaction([
    prisma.costLedgerEntry.deleteMany({ where: { businessId, fiscalPeriodId } }),
    prisma.journalEntry.deleteMany({
      where: { businessId, fiscalPeriodId, sourceType: JournalSourceType.TRADE },
    }),
    prisma.costLedgerEntry.createMany({ data: ledgerRows }),
    prisma.journalEntry.createMany({ data: journalRows }),
  ]);

  return {
    securityCount: tradesBySecurity.size,
    tradeCount: trades.length,
    journalLineCount: journalRows.length,
    warnings,
  };
}

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
