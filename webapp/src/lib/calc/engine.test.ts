import { describe, expect, it } from "vitest";
import { addMonths, calculatePlan, fiscalYearMonths, ymKey } from "./engine";

function buildActuals(entries: Array<[string, number, number, number]>) {
  // [accountId, year, month, amount]
  const map = new Map<string, Map<string, number>>();
  for (const [accountId, year, month, amount] of entries) {
    if (!map.has(accountId)) map.set(accountId, new Map());
    map.get(accountId)!.set(ymKey(year, month), amount);
  }
  return map;
}

describe("addMonths / fiscalYearMonths", () => {
  it("rolls over the year boundary", () => {
    expect(addMonths({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("builds 12 consecutive months from the fiscal year start", () => {
    const months = fiscalYearMonths({ year: 2026, month: 4 });
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 4 });
    expect(months[11]).toEqual({ year: 2027, month: 3 });
  });
});

describe("calculatePlan", () => {
  const fiscalYearStart = { year: 2026, month: 4 };

  it("PREV_YEAR_SAME: 前年同月の実績をそのまま使う", () => {
    const actuals = buildActuals([
      ["sales", 2025, 4, 1000],
      ["sales", 2025, 5, 1100],
    ]);
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [{ accountId: "sales", calcMethod: "PREV_YEAR_SAME" }],
      actuals,
    });
    const sales = result.accounts[0];
    expect(sales.months[0]).toMatchObject({ year: 2026, month: 4, amount: 1000 });
    expect(sales.months[1]).toMatchObject({ year: 2026, month: 5, amount: 1100 });
    // 2025-04, 2025-05 分の実績しか用意していないため、残り10ヶ月分は警告が出る
    expect(sales.warnings).toHaveLength(10);
  });

  it("PREV_YEAR_SAME: 実績が欠けている月は0円になり警告が出る", () => {
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [{ accountId: "sales", calcMethod: "PREV_YEAR_SAME" }],
      actuals: new Map(),
    });
    expect(result.accounts[0].months[0].amount).toBe(0);
    expect(result.accounts[0].warnings.length).toBeGreaterThan(0);
  });

  it("DIRECT: 指定した月次の値をそのまま返す", () => {
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [
        {
          accountId: "misc",
          calcMethod: "DIRECT",
          directValues: { [ymKey(2026, 4)]: 500, [ymKey(2026, 5)]: 600 },
        },
      ],
      actuals: new Map(),
    });
    const misc = result.accounts[0];
    expect(misc.months[0].amount).toBe(500);
    expect(misc.months[1].amount).toBe(600);
    // 3月以降(直接入力なし)は0円+警告
    expect(misc.months[11].amount).toBe(0);
    expect(misc.warnings.length).toBeGreaterThan(0);
  });

  it("LINKED: 連動先科目の同月の値に割合を掛ける", () => {
    const actuals = buildActuals([["sales", 2025, 4, 1000]]);
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [
        { accountId: "sales", calcMethod: "PREV_YEAR_SAME" },
        { accountId: "cogs", calcMethod: "LINKED", linkedAccountId: "sales", linkedPercentage: 60 },
      ],
      actuals,
    });
    const cogs = result.accounts.find((a) => a.accountId === "cogs")!;
    expect(cogs.months[0].amount).toBeCloseTo(600);
  });

  it("LINKED: 循環参照はエラーとして報告される", () => {
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [
        { accountId: "a", calcMethod: "LINKED", linkedAccountId: "b", linkedPercentage: 100 },
        { accountId: "b", calcMethod: "LINKED", linkedAccountId: "a", linkedPercentage: 100 },
      ],
      actuals: new Map(),
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("PAST_AVERAGE: 期首月は実績12ヶ月分の平均になる", () => {
    // 2025-04 ~ 2026-03 の12ヶ月実績(平均は 100)
    const entries: Array<[string, number, number, number]> = [];
    let y = 2025, m = 4;
    for (let i = 0; i < 12; i++) {
      entries.push(["rent", y, m, 90 + i]); // 90..101, 平均95.5
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const actuals = buildActuals(entries);
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [{ accountId: "rent", calcMethod: "PAST_AVERAGE" }],
      actuals,
    });
    const rent = result.accounts[0];
    expect(rent.months[0].amount).toBeCloseTo(95.5);
  });

  it("PAST_AVERAGE: 計画年度に入ってからは自年度内の既算出値もローリングで含める", () => {
    // 直近12ヶ月がすべて100の実績だとすると、期首月は100。
    const entries: Array<[string, number, number, number]> = [];
    let y = 2025, m = 4;
    for (let i = 0; i < 12; i++) {
      entries.push(["util", y, m, 100]);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const actuals = buildActuals(entries);
    const result = calculatePlan({
      fiscalYearStart,
      planEntries: [
        { accountId: "util", calcMethod: "DIRECT", directValues: { [ymKey(2026, 4)]: 1200 } },
      ],
      actuals,
    });
    // DIRECTだけのケースでは影響しないので、PAST_AVERAGEを別科目で検証
    expect(result.accounts[0].months[0].amount).toBe(1200);

    const result2 = calculatePlan({
      fiscalYearStart,
      planEntries: [{ accountId: "util", calcMethod: "PAST_AVERAGE" }],
      actuals,
    });
    // 2026-05 の過去12ヶ月 = 2025-05..2026-04。2026-04は実績なし・自年度の計算値(100)を使う
    expect(result2.accounts[0].months[1].amount).toBeCloseTo(100);
  });
});
