// 消費税・法人税の概算計算。DBに依存しない純粋関数として実装する。
// あくまで概算であり、実際の申告額とは異なる（軽減税率・別表調整・
// 各種控除等は考慮していない）。

export interface CorporateTaxEstimateInput {
  /** 税引前当期純利益（計画） */
  pretaxIncome: number;
  /** 実効税率(%) */
  effectiveTaxRatePercent: number;
  /** 当期に控除できる繰越欠損金 */
  lossCarryforward: number;
}

export interface CorporateTaxEstimate {
  /** 繰越欠損金控除後の課税所得（マイナスの場合は0） */
  taxableIncome: number;
  /** 概算年税額 */
  estimatedAnnualTax: number;
}

export function estimateCorporateTax(input: CorporateTaxEstimateInput): CorporateTaxEstimate {
  const taxableIncome = Math.max(0, input.pretaxIncome - Math.max(0, input.lossCarryforward));
  const estimatedAnnualTax = taxableIncome * (input.effectiveTaxRatePercent / 100);
  return { taxableIncome, estimatedAnnualTax };
}

export interface ConsumptionTaxEstimateInput {
  /** 課税売上高（年間） */
  taxableRevenue: number;
  /** 課税仕入高（年間、売上原価＋販管費のうち課税区分が「課税」の科目の合計） */
  taxableExpense: number;
  /** 消費税率(%) */
  ratePercent: number;
}

export interface ConsumptionTaxEstimate {
  /** 概算年税額。マイナスの場合は還付見込みを示す */
  estimatedAnnualTax: number;
}

export function estimateConsumptionTax(input: ConsumptionTaxEstimateInput): ConsumptionTaxEstimate {
  const estimatedAnnualTax = (input.taxableRevenue - input.taxableExpense) * (input.ratePercent / 100);
  return { estimatedAnnualTax };
}

/**
 * 中間納付額の概算。前期の年間確定税額の1/2という簡便な予定申告ベースの近似値
 * （仮決算による中間申告や納付不要となる少額基準は考慮していない）。
 */
export function estimateInterimPayment(priorYearAnnualTax: number | null | undefined): number | null {
  if (priorYearAnnualTax == null) return null;
  return priorYearAnnualTax / 2;
}
