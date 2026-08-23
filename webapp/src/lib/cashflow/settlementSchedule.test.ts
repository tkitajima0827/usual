import { describe, expect, it } from "vitest";
import {
  buildSettlementSchedule,
  FALLBACK_SETTLEMENT_TERM,
  resolveSettlementTerm,
  shiftMonthlyAmounts,
} from "./settlementSchedule";

describe("resolveSettlementTerm", () => {
  it("科目の個別設定が3項目すべて揃っていればそれを優先する", () => {
    const result = resolveSettlementTerm(
      { closingDay: 20, monthsAfter: 1, settlementDay: 10 },
      { closingDay: 31, monthsAfter: 1, settlementDay: 31 },
    );
    expect(result).toEqual({ closingDay: 20, monthsAfter: 1, settlementDay: 10 });
  });

  it("科目の個別設定が一部だけの場合は事業者既定を使う", () => {
    const result = resolveSettlementTerm(
      { closingDay: 20, monthsAfter: null, settlementDay: 10 },
      { closingDay: 31, monthsAfter: 2, settlementDay: 31 },
    );
    expect(result).toEqual({ closingDay: 31, monthsAfter: 2, settlementDay: 31 });
  });

  it("事業者既定も無い場合はフォールバック（末締め翌月末）を使う", () => {
    expect(resolveSettlementTerm(null, null)).toEqual(FALLBACK_SETTLEMENT_TERM);
  });
});

describe("shiftMonthlyAmounts", () => {
  it("monthsAfterヶ月後の暦月にシフトする", () => {
    const result = shiftMonthlyAmounts(
      [{ year: 2026, month: 4, amount: 1000 }],
      { closingDay: 31, monthsAfter: 1, settlementDay: 31 },
    );
    expect(result).toEqual([{ year: 2026, month: 5, amount: 1000 }]);
  });

  it("年をまたぐ場合も正しく繰り上がる", () => {
    const result = shiftMonthlyAmounts(
      [{ year: 2026, month: 12, amount: 500 }],
      { closingDay: 31, monthsAfter: 2, settlementDay: 31 },
    );
    expect(result).toEqual([{ year: 2027, month: 2, amount: 500 }]);
  });

  it("monthsAfter=0（即日決済）なら同月のまま", () => {
    const result = shiftMonthlyAmounts(
      [{ year: 2026, month: 6, amount: 300 }],
      { closingDay: 31, monthsAfter: 0, settlementDay: 31 },
    );
    expect(result).toEqual([{ year: 2026, month: 6, amount: 300 }]);
  });
});

describe("buildSettlementSchedule", () => {
  const fiscalMonths = Array.from({ length: 12 }, (_, i) => {
    const total = 2026 * 12 + 3 + i; // FY2026: 2026-04 ~ 2027-03
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  });

  it("年度開始前の繰越分を含めて年度内の月次予定に反映する", () => {
    const sourceMonths = [
      { year: 2026, month: 3, amount: 900 }, // 前年度3月発生 → 翌月2026-04着金（年度初月に繰り越し）
      { year: 2026, month: 4, amount: 1000 },
      { year: 2027, month: 3, amount: 1200 }, // 年度末月発生 → 翌月2027-04着金（次年度側になるため今回は含まない）
    ];
    const schedule = buildSettlementSchedule({
      fiscalMonths,
      sourceMonths,
      term: { closingDay: 31, monthsAfter: 1, settlementDay: 31 },
    });
    expect(schedule[0]).toBe(900); // 2026-04
    expect(schedule[1]).toBe(1000); // 2026-05
    expect(schedule[11]).toBe(0); // 2027-03（2027-03分は次年度の2027-04に着金するため含まれない）
    expect(schedule.reduce((a, b) => a + b, 0)).toBe(1900);
  });
});
