// 表示ラベル定数。DB/Prismaに依存しないため、Client Componentからも
// 安全にインポートできる（queries.tsはPrismaに依存するためサーバー専用）。
export const CALC_METHOD_LABEL: Record<string, string> = {
  PREV_YEAR_SAME: "前年同額",
  LINKED: "科目連動",
  DIRECT: "直接入力",
  PAST_AVERAGE: "過去平均",
};

export const CONSUMPTION_TAX_CATEGORY_LABEL: Record<string, string> = {
  TAXABLE: "課税",
  EXEMPT: "非課税",
  OUT_OF_SCOPE: "対象外",
};

export const PL_CATEGORY_LABEL: Record<string, string> = {
  REVENUE: "売上高",
  COGS: "売上原価",
  SGA: "販売費及び一般管理費",
  NON_OPERATING_INCOME: "営業外収益",
  NON_OPERATING_EXPENSE: "営業外費用",
  EXTRAORDINARY_INCOME: "特別利益",
  EXTRAORDINARY_LOSS: "特別損失",
  INCOME_TAXES: "法人税等",
};
