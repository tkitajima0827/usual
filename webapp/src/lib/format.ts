const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

export function formatYen(amount: number): string {
  return yenFormatter.format(Math.round(amount));
}

export function formatYenCompact(amount: number): string {
  const oku = 100_000_000;
  const man = 10_000;
  if (Math.abs(amount) >= oku) {
    return `${(amount / oku).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}億円`;
  }
  if (Math.abs(amount) >= man) {
    return `${Math.round(amount / man).toLocaleString("ja-JP")}万円`;
  }
  return formatYen(amount);
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];
