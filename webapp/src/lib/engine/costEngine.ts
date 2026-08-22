import { TransactionType, LotType } from "@/generated/prisma/enums";

/**
 * 移動平均法による原価計算エンジン。
 *
 * SBI証券の建玉照会・月次取引報告書を実データで検証した結果、
 * 現引・現渡は「新規建て時と全く同じ約定単価」で決済されており、
 * 信用取引側では損益を一切発生させない“付け替え”であることを確認した
 * （例: 日揮HD 信用新規買@1,110 → 現引@1,110、東急 信用新規売@1,801/1,799.1/1,799.2
 * → 現渡がそれぞれ同じ単価で決済）。
 * そのため、現引・現渡の実現損益はすべて現物側（信用の平均取得原価との
 * 付け替え、または現物の平均取得原価との差額）でのみ認識する。
 */

export interface LotState {
  quantity: number;
  bookValue: number;
}

export interface SecurityPosition {
  spot: LotState;
  marginLong: LotState;
  marginShort: LotState;
}

export function emptyPosition(): SecurityPosition {
  return {
    spot: { quantity: 0, bookValue: 0 },
    marginLong: { quantity: 0, bookValue: 0 },
    marginShort: { quantity: 0, bookValue: 0 },
  };
}

function avgCost(lot: LotState): number {
  return lot.quantity === 0 ? 0 : lot.bookValue / lot.quantity;
}

export interface EngineTrade {
  id: string;
  tradeDate: Date;
  transactionType: TransactionType;
  quantity: number;
  unitPrice: number;
  fee: number;
}

export interface LedgerStep {
  tradeId: string;
  lotType: LotType;
  quantityDelta: number;
  quantityAfter: number;
  avgUnitCostAfter: number;
  bookValueAfter: number;
  realizedGain: number | null;
  /** 決済(数量減少)時にロットから取り崩した原価/売建代金基準額。仕訳生成で使用する。 */
  costRemoved: number | null;
}

export interface ProcessResult {
  steps: LedgerStep[];
  finalPosition: SecurityPosition;
  warnings: string[];
}

/**
 * ある1銘柄について、期首残高 + 取引履歴(日付昇順)から
 * 各取引時点の残高・実現損益を計算する。
 */
export function processSecurityTrades(
  opening: SecurityPosition,
  trades: EngineTrade[],
  securityLabel: string,
): ProcessResult {
  const position: SecurityPosition = {
    spot: { ...opening.spot },
    marginLong: { ...opening.marginLong },
    marginShort: { ...opening.marginShort },
  };
  const steps: LedgerStep[] = [];
  const warnings: string[] = [];

  const sorted = [...trades].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  const pushStep = (
    tradeId: string,
    lotType: LotType,
    quantityDelta: number,
    lot: LotState,
    realizedGain: number | null,
    costRemoved: number | null = null,
  ) => {
    steps.push({
      tradeId,
      lotType,
      quantityDelta,
      quantityAfter: lot.quantity,
      avgUnitCostAfter: avgCost(lot),
      bookValueAfter: lot.bookValue,
      realizedGain,
      costRemoved,
    });
  };

  const closeLot = (
    lot: LotState,
    quantity: number,
    label: string,
  ): { costRemoved: number; shortfall: number } => {
    if (quantity > lot.quantity) {
      warnings.push(
        `${securityLabel}: ${label}の残数量(${lot.quantity})を超える決済数量(${quantity})が指定されました。残数量でクランプします。`,
      );
    }
    const q = Math.min(quantity, lot.quantity);
    const shortfall = quantity - q;
    const cost = q === 0 ? 0 : avgCost(lot) * q;
    lot.quantity -= q;
    lot.bookValue -= Math.round(cost);
    return { costRemoved: Math.round(cost), shortfall };
  };

  for (const trade of sorted) {
    switch (trade.transactionType) {
      case TransactionType.SPOT_BUY: {
        const cost = trade.quantity * trade.unitPrice + trade.fee;
        position.spot.quantity += trade.quantity;
        position.spot.bookValue += cost;
        pushStep(trade.id, LotType.SPOT, trade.quantity, position.spot, null);
        break;
      }

      case TransactionType.SPOT_SELL: {
        const { costRemoved } = closeLot(position.spot, trade.quantity, "現物");
        const proceeds = trade.quantity * trade.unitPrice - trade.fee;
        const gain = proceeds - costRemoved;
        pushStep(trade.id, LotType.SPOT, -trade.quantity, position.spot, gain, costRemoved);
        break;
      }

      case TransactionType.MARGIN_OPEN_BUY: {
        const cost = trade.quantity * trade.unitPrice + trade.fee;
        position.marginLong.quantity += trade.quantity;
        position.marginLong.bookValue += cost;
        pushStep(trade.id, LotType.MARGIN_LONG, trade.quantity, position.marginLong, null);
        break;
      }

      case TransactionType.MARGIN_CLOSE_SELL: {
        const { costRemoved } = closeLot(position.marginLong, trade.quantity, "信用買建");
        const proceeds = trade.quantity * trade.unitPrice - trade.fee;
        const gain = proceeds - costRemoved;
        pushStep(trade.id, LotType.MARGIN_LONG, -trade.quantity, position.marginLong, gain, costRemoved);
        break;
      }

      case TransactionType.MARGIN_OPEN_SELL: {
        // 売建の"取得価額"は新規売付時の受渡代金(受取額)そのもの。
        const proceedsBasis = trade.quantity * trade.unitPrice - trade.fee;
        position.marginShort.quantity += trade.quantity;
        position.marginShort.bookValue += proceedsBasis;
        pushStep(trade.id, LotType.MARGIN_SHORT, trade.quantity, position.marginShort, null);
        break;
      }

      case TransactionType.MARGIN_CLOSE_BUY: {
        const { costRemoved: proceedsBasisRemoved } = closeLot(
          position.marginShort,
          trade.quantity,
          "信用売建",
        );
        const buyBackCost = trade.quantity * trade.unitPrice + trade.fee;
        const gain = proceedsBasisRemoved - buyBackCost;
        pushStep(
          trade.id,
          LotType.MARGIN_SHORT,
          -trade.quantity,
          position.marginShort,
          gain,
          proceedsBasisRemoved,
        );
        break;
      }

      case TransactionType.ASSIGN_BUY: {
        // 現引: 信用買建を同一単価で決済し、現物へそのまま付け替える(損益なし)。
        const { costRemoved } = closeLot(position.marginLong, trade.quantity, "信用買建(現引)");
        pushStep(trade.id, LotType.MARGIN_LONG, -trade.quantity, position.marginLong, 0, costRemoved);

        const spotCostAdded = costRemoved + trade.fee;
        position.spot.quantity += trade.quantity;
        position.spot.bookValue += spotCostAdded;
        pushStep(trade.id, LotType.SPOT, trade.quantity, position.spot, null);
        break;
      }

      case TransactionType.ASSIGN_SELL: {
        // 現渡: 保有現物を信用売建の決済に充当する。
        // 信用売建側は同一単価での決済のため損益ゼロ、
        // 経済的な実現損益は現物の平均原価との差額としてのみ認識する。
        const { costRemoved: marginBasisRemoved } = closeLot(
          position.marginShort,
          trade.quantity,
          "信用売建(現渡)",
        );
        pushStep(
          trade.id,
          LotType.MARGIN_SHORT,
          -trade.quantity,
          position.marginShort,
          0,
          marginBasisRemoved,
        );

        const { costRemoved: spotCostRemoved } = closeLot(position.spot, trade.quantity, "現物(現渡)");
        const proceeds = trade.quantity * trade.unitPrice - trade.fee;
        const gain = proceeds - spotCostRemoved;
        pushStep(trade.id, LotType.SPOT, -trade.quantity, position.spot, gain, spotCostRemoved);
        break;
      }
    }
  }

  return { steps, finalPosition: position, warnings };
}
