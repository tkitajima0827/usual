// 勘定科目名から消費税の課税区分（課税/非課税/対象外）を推定する。
// あくまで「概算計算」向けの簡易ヒューリスティックであり、正確な税務判定の
// 代わりにはならない（軽減税率・按分・個別事情は考慮していない）。
// 新規科目の初期値として使い、必要に応じて画面から手動で上書きする想定。
export type ConsumptionTaxCategory = "TAXABLE" | "EXEMPT" | "OUT_OF_SCOPE";

// 対象外（不課税）: 給与・税金・引当金繰入・減価償却など、そもそも
// 「対価を支払って何かを買う」取引ではない科目
const OUT_OF_SCOPE_KEYWORDS = [
  "役員報酬",
  "給料",
  "給与",
  "賞与",
  "法定福利費",
  "租税公課",
  "法人税",
  "住民税",
  "事業税",
  "寄付金",
  "引当金繰入",
  "引当金戻入",
  "減価償却費",
  "長期前払費用償却",
  "繰延資産償却",
  "棚卸高", // 期首/期末商品棚卸高: 仕入時点で課税処理済みのため対象外
  "貸倒損失",
];

// 非課税: 消費税法上、利息・保険など性質上課税されない取引
const EXEMPT_KEYWORDS = ["支払利息", "受取利息", "受取配当金", "保険料"];

export function classifyConsumptionTax(accountName: string): ConsumptionTaxCategory {
  if (OUT_OF_SCOPE_KEYWORDS.some((k) => accountName.includes(k))) return "OUT_OF_SCOPE";
  if (EXEMPT_KEYWORDS.some((k) => accountName.includes(k))) return "EXEMPT";
  return "TAXABLE";
}
