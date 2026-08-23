import { describe, expect, it } from "vitest";
import { convertMfTransitionPlToActualImportRows, type MfAccountSummary, type MfTransitionPlReport } from "./mfCloudAdapter";

const accounts: MfAccountSummary[] = [
  { id: "acc-sales", name: "売上高", account_group: "REVENUE", category: "NET_SALES", financial_statement_type: "PROFIT_LOSS" },
  { id: "acc-dep", name: "減価償却費", account_group: "EXPENSE", category: "SELLING_GENERAL_AND_ADMINISTRATIVE_EXPENSES", financial_statement_type: "PROFIT_LOSS" },
  { id: "acc-cash", name: "現金", account_group: "ASSET", category: "CASH_AND_DEPOSITS", financial_statement_type: "BALANCE_SHEET" },
  { id: "acc-transfer", name: "他勘定振替高", account_group: "EXPENSE", category: "TRANSFERS_TO_OTHER_ACCOUNTS", financial_statement_type: "PROFIT_LOSS" },
];

function buildReport(): MfTransitionPlReport {
  const zeros10 = Array(10).fill(0);
  return {
    start_date: "2025-01-01",
    columns: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "settlement_balance", "total"],
    rows: [
      {
        name: "売上高合計",
        type: "financial_statement_item",
        values: [],
        rows: [
          {
            name: "売上高",
            type: "account",
            // 補助科目の内訳(sub_account)は取り込まない。親の値だけを使う
            rows: [
              { name: "法人", type: "sub_account", rows: null, values: [80, 20, ...zeros10, 0, 100] },
              { name: "個人", type: "sub_account", rows: null, values: [20, 0, ...zeros10, 0, 20] },
            ],
            values: [100, 20, ...zeros10, 0, 120],
          },
        ],
      },
      {
        name: "販売費及び一般管理費合計",
        type: "financial_statement_item",
        values: [],
        rows: [
          {
            name: "減価償却費",
            type: "account",
            rows: null,
            // settlement_balance(決算整理仕訳)が -7 → 12月に合算されるべき
            values: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, -7, 113],
          },
          {
            name: "他勘定振替高",
            type: "account",
            rows: null,
            values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
          },
          {
            name: "未登録の科目",
            type: "account",
            rows: null,
            values: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
          },
        ],
      },
      {
        // 純粋な小計行（実科目を含まない）はスキップされる
        name: "売上総利益",
        type: "financial_statement_item",
        rows: [],
        values: [90, 10, ...zeros10, 0, 100],
      },
      {
        name: "資産の部",
        type: "financial_statement_item",
        values: [],
        rows: [{ name: "現金", type: "account", rows: null, values: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 12] }],
      },
    ],
  };
}

describe("convertMfTransitionPlToActualImportRows", () => {
  it("勘定科目ノードから月次の行を生成する（暦月はstart_dateから決まる）", () => {
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    const sales = rows.filter((r) => r.accountName === "売上高");
    expect(sales).toHaveLength(12);
    expect(sales[0]).toMatchObject({ accountCode: "acc-sales", year: 2025, month: 1, amount: 100, plCategory: "REVENUE" });
    expect(sales[1]).toMatchObject({ year: 2025, month: 2, amount: 20 });
  });

  it("sub_accountの内訳は個別には取り込まない（親科目の値のみ使用）", () => {
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    expect(rows.some((r) => r.accountName === "法人" || r.accountName === "個人")).toBe(false);
  });

  it("純粋な小計行（rowsが空のfinancial_statement_item）はスキップされる", () => {
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    expect(rows.some((r) => r.accountName === "売上総利益")).toBe(false);
  });

  it("settlement_balance(決算整理仕訳)は最終月(12月)に合算される", () => {
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    const dep = rows.filter((r) => r.accountName === "減価償却費");
    expect(dep[0].amount).toBe(10);
    expect(dep[11].amount).toBe(3); // 10 + (-7)
  });

  it("importBeforeYearMonth以降（未経過月）はスキップする（0円実績として汚染させない）", () => {
    // buildReport()の売上高はstart_date=2025-01-01 → 1月分は100, 2月分は20
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts, {
      importBeforeYearMonth: { year: 2025, month: 2 },
    });
    const sales = rows.filter((r) => r.accountName === "売上高");
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ year: 2025, month: 1, amount: 100 });
  });

  it("BS科目(financial_statement_type=BALANCE_SHEET)は取り込まない", () => {
    const { rows } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    expect(rows.some((r) => r.accountName === "現金")).toBe(false);
  });

  it("未対応カテゴリの科目は分類未設定(plCategory未指定)で取り込み、警告を出す", () => {
    const { rows, warnings } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    const transfer = rows.filter((r) => r.accountName === "他勘定振替高");
    expect(transfer).toHaveLength(12);
    expect(transfer[0].plCategory).toBeUndefined();
    expect(warnings.some((w) => w.includes("他勘定振替高"))).toBe(true);
  });

  it("勘定科目マスタに存在しない科目はスキップし、警告を出す", () => {
    const { rows, warnings } = convertMfTransitionPlToActualImportRows(buildReport(), accounts);
    expect(rows.some((r) => r.accountName === "未登録の科目")).toBe(false);
    expect(warnings.some((w) => w.includes("未登録の科目"))).toBe(true);
  });
});
