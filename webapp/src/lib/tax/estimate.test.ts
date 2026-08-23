import { describe, expect, it } from "vitest";
import { estimateConsumptionTax, estimateCorporateTax, estimateInterimPayment } from "./estimate";

describe("estimateCorporateTax", () => {
  it("課税所得×実効税率で概算年税額を算出する", () => {
    const result = estimateCorporateTax({
      pretaxIncome: 10_000_000,
      effectiveTaxRatePercent: 33,
      lossCarryforward: 0,
    });
    expect(result.taxableIncome).toBe(10_000_000);
    expect(result.estimatedAnnualTax).toBeCloseTo(3_300_000);
  });

  it("繰越欠損金を控除してから税率を乗じる", () => {
    const result = estimateCorporateTax({
      pretaxIncome: 10_000_000,
      effectiveTaxRatePercent: 30,
      lossCarryforward: 4_000_000,
    });
    expect(result.taxableIncome).toBe(6_000_000);
    expect(result.estimatedAnnualTax).toBeCloseTo(1_800_000);
  });

  it("赤字の場合は課税所得・税額ともに0になる", () => {
    const result = estimateCorporateTax({
      pretaxIncome: -5_000_000,
      effectiveTaxRatePercent: 33,
      lossCarryforward: 0,
    });
    expect(result.taxableIncome).toBe(0);
    expect(result.estimatedAnnualTax).toBe(0);
  });
});

describe("estimateConsumptionTax", () => {
  it("課税売上と課税仕入の差額に税率を乗じる", () => {
    const result = estimateConsumptionTax({
      taxableRevenue: 50_000_000,
      taxableExpense: 20_000_000,
      ratePercent: 10,
    });
    expect(result.estimatedAnnualTax).toBeCloseTo(3_000_000);
  });

  it("課税仕入が課税売上を上回る場合はマイナス（還付見込み）になる", () => {
    const result = estimateConsumptionTax({
      taxableRevenue: 5_000_000,
      taxableExpense: 8_000_000,
      ratePercent: 10,
    });
    expect(result.estimatedAnnualTax).toBeCloseTo(-300_000);
  });
});

describe("estimateInterimPayment", () => {
  it("前期年税額の1/2を返す", () => {
    expect(estimateInterimPayment(1_000_000)).toBe(500_000);
  });

  it("前期実績が未登録の場合はnullを返す", () => {
    expect(estimateInterimPayment(null)).toBeNull();
    expect(estimateInterimPayment(undefined)).toBeNull();
  });
});
