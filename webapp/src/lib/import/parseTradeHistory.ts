import { TransactionType } from "@/generated/prisma/enums";
import { cellToString, parseDateCell, parseNumberCell, parseNullableNumberCell } from "./cellUtils";

export interface ParsedTrade {
  tradeDate: Date;
  settlementDate: Date | null;
  securityCode: string;
  securityName: string;
  market: string | null;
  transactionType: TransactionType;
  termType: string | null;
  quantity: number;
  unitPrice: number;
  fee: number;
  tax: number;
  settlementAmount: number | null;
}

export interface ParseWarning {
  rowIndex: number;
  message: string;
}

export interface ParseResult {
  trades: ParsedTrade[];
  warnings: ParseWarning[];
}

const HEADER_MARKERS = ["約定日", "銘柄コード"];

const TRANSACTION_TYPE_MAP: Record<string, TransactionType> = {
  株式現物買: TransactionType.SPOT_BUY,
  株式現物売: TransactionType.SPOT_SELL,
  信用新規買: TransactionType.MARGIN_OPEN_BUY,
  信用新規売: TransactionType.MARGIN_OPEN_SELL,
  信用返済買: TransactionType.MARGIN_CLOSE_BUY,
  信用返済売: TransactionType.MARGIN_CLOSE_SELL,
  現引: TransactionType.ASSIGN_BUY,
  現渡: TransactionType.ASSIGN_SELL,
};

/**
 * SBI証券「約定履歴照会」のエクスポート(元データ)を解析する。
 * ヘッダー行の位置がファイルごとに揺れるため、
 * 「約定日」「銘柄コード」を含む行を探してヘッダーとして扱う。
 */
export function parseTradeHistoryRows(rawRows: unknown[][]): ParseResult {
  const trades: ParsedTrade[] = [];
  const warnings: ParseWarning[] = [];

  const headerIndex = rawRows.findIndex((row) => {
    const line = row.map(cellToString).join(" ");
    return HEADER_MARKERS.every((marker) => line.includes(marker));
  });

  if (headerIndex === -1) {
    warnings.push({
      rowIndex: -1,
      message: "ヘッダー行（約定日・銘柄コードを含む行）が見つかりませんでした。",
    });
    return { trades, warnings };
  }

  const header = rawRows[headerIndex].map(cellToString);
  const col = (name: string) => header.findIndex((h) => h === name);

  const idx = {
    tradeDate: col("約定日"),
    security: col("銘柄"),
    code: col("銘柄コード"),
    market: col("市場"),
    type: col("取引"),
    term: col("期限"),
    quantity: col("約定数量"),
    unitPrice: col("約定単価"),
    fee: col("手数料/諸経費等"),
    tax: col("税額"),
    settlementDate: col("受渡日"),
    settlementAmount: col("受渡金額/決済損益"),
  };

  const missingRequired = (["tradeDate", "code", "type", "quantity", "unitPrice"] as const).filter(
    (key) => idx[key] === -1,
  );
  if (missingRequired.length > 0) {
    warnings.push({
      rowIndex: headerIndex,
      message: `必須列が見つかりません: ${missingRequired.join(", ")}`,
    });
    return { trades, warnings };
  }

  for (let r = headerIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c) => cellToString(c) === "")) continue;

    const code = cellToString(row[idx.code]);
    const typeRaw = cellToString(row[idx.type]);
    if (!code || !typeRaw) continue;

    const tradeDate = parseDateCell(row[idx.tradeDate]);
    if (!tradeDate) {
      warnings.push({ rowIndex: r, message: `約定日を解釈できませんでした: 行${r + 1}` });
      continue;
    }

    const transactionType = TRANSACTION_TYPE_MAP[typeRaw];
    if (!transactionType) {
      warnings.push({
        rowIndex: r,
        message: `未対応の取引区分のためスキップしました: "${typeRaw}" (行${r + 1})`,
      });
      continue;
    }

    trades.push({
      tradeDate,
      settlementDate: idx.settlementDate >= 0 ? parseDateCell(row[idx.settlementDate]) : null,
      securityCode: code,
      securityName: idx.security >= 0 ? cellToString(row[idx.security]) : code,
      market: idx.market >= 0 ? cellToString(row[idx.market]) || null : null,
      transactionType,
      termType: idx.term >= 0 ? cellToString(row[idx.term]) || null : null,
      quantity: parseNumberCell(row[idx.quantity]),
      unitPrice: parseNumberCell(row[idx.unitPrice]),
      fee: idx.fee >= 0 ? parseNumberCell(row[idx.fee]) : 0,
      tax: idx.tax >= 0 ? parseNumberCell(row[idx.tax]) : 0,
      settlementAmount:
        idx.settlementAmount >= 0 ? parseNullableNumberCell(row[idx.settlementAmount]) : null,
    });
  }

  return { trades, warnings };
}
