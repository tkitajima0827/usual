import { TransactionType } from "@/generated/prisma/enums";

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  SPOT_BUY: "株式現物買",
  SPOT_SELL: "株式現物売",
  MARGIN_OPEN_BUY: "信用新規買",
  MARGIN_OPEN_SELL: "信用新規売",
  MARGIN_CLOSE_BUY: "信用返済買",
  MARGIN_CLOSE_SELL: "信用返済売",
  ASSIGN_BUY: "現引",
  ASSIGN_SELL: "現渡",
};

export function buildTradeMemo(
  securityName: string,
  type: TransactionType,
  quantity: number,
  unitPrice: number,
): string {
  const priceLabel = Number.isInteger(unitPrice) ? String(unitPrice) : unitPrice.toFixed(1);
  return `${securityName}　${TRANSACTION_LABELS[type]}　${quantity}株×@${priceLabel}`;
}
