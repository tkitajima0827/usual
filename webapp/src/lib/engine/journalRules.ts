import { TransactionType, LotType } from "@/generated/prisma/enums";
import type { LedgerStep } from "./costEngine";

/**
 * 蛤覚合同会社の実際のMF会計仕訳（弥生インポート）を解析して確定させた
 * 勘定科目マッピング。現引・現渡・信用新規/返済のいずれも、
 * このマッピングに沿った複数行の仕訳として実データと一致することを確認済み。
 */
const ACCOUNTS = {
  cash: "預け金",
  spotAsset: "売買目的有価証券",
  marginLongPayable: "信用取引未払金",
  marginLongCollateral: "担保差入有価証券",
  marginShortLiability: "借入有価証券",
  marginShortCollateral: "担保差入金",
  marginPlug: "差入証拠金",
  marginPlugSub: "先物・オプション",
  fee: "支払手数料",
  feeSub: "証券口座",
  gain: "有価証券運用益",
} as const;

export interface JournalLineDraft {
  debitAccount: string;
  debitSubAccount: string | null;
  debitAmount: number;
  creditAccount: string;
  creditSubAccount: string | null;
  creditAmount: number;
  memo: string;
}

export interface JournalTradeInput {
  transactionType: TransactionType;
  quantity: number;
  unitPrice: number;
  fee: number;
  securityName: string;
  memo: string;
  cashSubAccount: string;
}

function line(
  debitAccount: string,
  debitSubAccount: string | null,
  creditAccount: string,
  creditSubAccount: string | null,
  amount: number,
  memo: string,
): JournalLineDraft | null {
  if (amount === 0) return null;
  const positive = amount > 0;
  return {
    debitAccount: positive ? debitAccount : creditAccount,
    debitSubAccount: positive ? debitSubAccount : creditSubAccount,
    debitAmount: Math.abs(amount),
    creditAccount: positive ? creditAccount : debitAccount,
    creditSubAccount: positive ? creditSubAccount : debitSubAccount,
    creditAmount: Math.abs(amount),
    memo,
  };
}

function gainLine(gain: number, memo: string): JournalLineDraft | null {
  // gain>0: 差入証拠金(借方)/有価証券運用益(貸方)、gain<0: 有価証券運用益(借方)/差入証拠金(貸方)
  return line(
    ACCOUNTS.marginPlug,
    ACCOUNTS.marginPlugSub,
    ACCOUNTS.gain,
    null,
    gain,
    memo,
  );
}

function feeLine(fee: number, memo: string): JournalLineDraft | null {
  if (fee <= 0) return null;
  return {
    debitAccount: ACCOUNTS.fee,
    debitSubAccount: ACCOUNTS.feeSub,
    debitAmount: fee,
    creditAccount: ACCOUNTS.marginPlug,
    creditSubAccount: ACCOUNTS.marginPlugSub,
    creditAmount: fee,
    memo,
  };
}

/** 現物側の手数料は預け金(証券口座)から支払われる。 */
function spotFeeLine(fee: number, cashSubAccount: string, memo: string): JournalLineDraft | null {
  if (fee <= 0) return null;
  return {
    debitAccount: ACCOUNTS.fee,
    debitSubAccount: ACCOUNTS.feeSub,
    debitAmount: fee,
    creditAccount: ACCOUNTS.cash,
    creditSubAccount: cashSubAccount,
    creditAmount: fee,
    memo,
  };
}

/**
 * 1取引(1つのTrade)についての仕訳明細行を生成する。
 * stepsにはそのtradeIdに紐づくCostLedgerEntry計算結果(1〜2件)を渡す。
 */
export function buildJournalLines(
  trade: JournalTradeInput,
  steps: LedgerStep[],
): JournalLineDraft[] {
  const lines: JournalLineDraft[] = [];
  const sub = trade.securityName;
  const grossAmount = trade.quantity * trade.unitPrice;

  switch (trade.transactionType) {
    case TransactionType.SPOT_BUY: {
      const cost = grossAmount + trade.fee;
      const l = line(ACCOUNTS.spotAsset, sub, ACCOUNTS.cash, trade.cashSubAccount, cost, trade.memo);
      if (l) lines.push(l);
      break;
    }

    case TransactionType.SPOT_SELL: {
      const step = steps.find((s) => s.lotType === LotType.SPOT);
      const costRemoved = step?.costRemoved ?? 0;
      const gain = step?.realizedGain ?? 0;
      const transferLine = line(
        ACCOUNTS.cash,
        trade.cashSubAccount,
        ACCOUNTS.spotAsset,
        sub,
        costRemoved,
        trade.memo,
      );
      if (transferLine) lines.push(transferLine);
      const feeL = spotFeeLine(trade.fee, trade.cashSubAccount, trade.memo);
      if (feeL) lines.push(feeL);
      const gL = line(ACCOUNTS.cash, trade.cashSubAccount, ACCOUNTS.gain, null, gain, trade.memo);
      if (gL) lines.push(gL);
      break;
    }

    case TransactionType.MARGIN_OPEN_BUY: {
      const cost = grossAmount + trade.fee;
      const l = line(
        ACCOUNTS.marginLongCollateral,
        sub,
        ACCOUNTS.marginLongPayable,
        sub,
        cost,
        trade.memo,
      );
      if (l) lines.push(l);
      break;
    }

    case TransactionType.MARGIN_CLOSE_SELL: {
      const step = steps.find((s) => s.lotType === LotType.MARGIN_LONG);
      const costRemoved = step?.costRemoved ?? 0;
      const gain = step?.realizedGain ?? 0;
      const feeL = feeLine(trade.fee, trade.memo);
      if (feeL) lines.push(feeL);
      const unwind = line(
        ACCOUNTS.marginLongPayable,
        sub,
        ACCOUNTS.marginLongCollateral,
        sub,
        costRemoved,
        trade.memo,
      );
      if (unwind) lines.push(unwind);
      const gL = gainLine(gain, trade.memo);
      if (gL) lines.push(gL);
      break;
    }

    case TransactionType.MARGIN_OPEN_SELL: {
      const proceedsBasis = grossAmount - trade.fee;
      const l = line(
        ACCOUNTS.marginShortCollateral,
        sub,
        ACCOUNTS.marginShortLiability,
        sub,
        proceedsBasis,
        trade.memo,
      );
      if (l) lines.push(l);
      break;
    }

    case TransactionType.MARGIN_CLOSE_BUY: {
      const step = steps.find((s) => s.lotType === LotType.MARGIN_SHORT);
      const proceedsBasisRemoved = step?.costRemoved ?? 0;
      const gain = step?.realizedGain ?? 0;
      const feeL = feeLine(trade.fee, trade.memo);
      if (feeL) lines.push(feeL);
      const unwind = line(
        ACCOUNTS.marginShortLiability,
        sub,
        ACCOUNTS.marginShortCollateral,
        sub,
        proceedsBasisRemoved,
        trade.memo,
      );
      if (unwind) lines.push(unwind);
      const gL = gainLine(gain, trade.memo);
      if (gL) lines.push(gL);
      break;
    }

    case TransactionType.ASSIGN_BUY: {
      // 現引: 信用買建の決済(損益ゼロ)と、現物への付け替え。
      const marginStep = steps.find((s) => s.lotType === LotType.MARGIN_LONG);
      const costRemoved = marginStep?.costRemoved ?? 0;
      const unwind = line(
        ACCOUNTS.marginLongPayable,
        sub,
        ACCOUNTS.marginLongCollateral,
        sub,
        costRemoved,
        trade.memo,
      );
      if (unwind) lines.push(unwind);

      const spotCostAdded = costRemoved + trade.fee;
      const transfer = line(
        ACCOUNTS.spotAsset,
        sub,
        ACCOUNTS.cash,
        trade.cashSubAccount,
        spotCostAdded,
        trade.memo,
      );
      if (transfer) lines.push(transfer);
      break;
    }

    case TransactionType.ASSIGN_SELL: {
      // 現渡: 信用売建の決済(損益ゼロ)と、現物の引渡し(実現損益はここで認識)。
      const marginStep = steps.find((s) => s.lotType === LotType.MARGIN_SHORT);
      const marginBasisRemoved = marginStep?.costRemoved ?? 0;
      const unwind = line(
        ACCOUNTS.marginShortLiability,
        sub,
        ACCOUNTS.marginShortCollateral,
        sub,
        marginBasisRemoved,
        trade.memo,
      );
      if (unwind) lines.push(unwind);

      const spotStep = steps.find((s) => s.lotType === LotType.SPOT);
      const spotCostRemoved = spotStep?.costRemoved ?? 0;
      const gain = spotStep?.realizedGain ?? 0;
      const transfer = line(
        ACCOUNTS.cash,
        trade.cashSubAccount,
        ACCOUNTS.spotAsset,
        sub,
        spotCostRemoved,
        trade.memo,
      );
      if (transfer) lines.push(transfer);
      const feeL = spotFeeLine(trade.fee, trade.cashSubAccount, trade.memo);
      if (feeL) lines.push(feeL);
      const gL = line(ACCOUNTS.cash, trade.cashSubAccount, ACCOUNTS.gain, null, gain, trade.memo);
      if (gL) lines.push(gL);
      break;
    }
  }

  return lines;
}
