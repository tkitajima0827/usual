// MFクラウド会計のMCPツール（mfc_ca_getAccounts / mfc_ca_getReportsTransitionProfitLoss）
// から取得した生JSONを、ソース非依存の ActualImportRow[] に変換するアダプタ。
// このファイルはMCP/ネットワークに依存しない純粋関数のみで構成する。
import { addMonths, type YearMonth } from "../calc/engine";
import type { ActualImportRow } from "./actuals";

export interface MfAccountSummary {
  id: string;
  name: string;
  account_group: string;
  category: string;
  financial_statement_type: "BALANCE_SHEET" | "PROFIT_LOSS";
}

export interface MfReportNode {
  name: string;
  type: "financial_statement_item" | "account" | "sub_account";
  rows: MfReportNode[] | null;
  values: number[];
}

export interface MfTransitionPlReport {
  start_date: string; // "YYYY-MM-DD"
  columns: string[]; // 例: ["1",...,"12","settlement_balance","total"]
  rows: MfReportNode[];
}

// MFの勘定科目カテゴリ(category) → 本システムのPLCategory
const PL_CATEGORY_BY_MF_CATEGORY: Record<string, NonNullable<ActualImportRow["plCategory"]>> = {
  NET_SALES: "REVENUE",
  EXTRAORDINARY_INCOME: "EXTRAORDINARY_INCOME",
  NON_OPERATING_INCOME: "NON_OPERATING_INCOME",
  COST_OF_PURCHASED_GOODS: "COGS",
  BEGINNING_INVENTORY: "COGS",
  ENDING_INVENTORY: "COGS",
  SELLING_GENERAL_AND_ADMINISTRATIVE_EXPENSES: "SGA",
  NON_OPERATING_EXPENSES: "NON_OPERATING_EXPENSE",
  EXTRAORDINARY_LOSSES: "EXTRAORDINARY_LOSS",
  CORPORATE_INCOME_TAXES_CURRENT: "INCOME_TAXES",
  CORPORATE_INCOME_TAXES_DEFERRED: "INCOME_TAXES",
  // TRANSFERS_TO_OTHER_ACCOUNTS(他勘定振替高)は文脈依存のため意図的に未対応。
  // plCategory未設定のまま作成され、警告として報告される。
};

function parseStartYearMonth(startDate: string): YearMonth {
  const [year, month] = startDate.split("-").map(Number);
  return { year, month };
}

function isBefore(a: YearMonth, b: YearMonth): boolean {
  return a.year * 12 + a.month < b.year * 12 + b.month;
}

export interface ConvertOptions {
  /**
   * この年月より前（＝この年月を含まない）のみ取り込む。年度途中の会計期間を
   * 取得した場合、MFはまだ発生していない将来月の値を0円で返してくる
   * （実際にはまだ記帳されていないだけで「実績0円」ではない）。これを
   * そのまま取り込むと、過去平均・前年同額の算出時にノイズになるため、
   * 呼び出し側で「今日時点でまだ経過していない月」を渡してスキップする。
   */
  importBeforeYearMonth?: YearMonth;
}

/**
 * 推移表の損益計算書(getReportsTransitionProfitLoss)のレスポンスを
 * ActualImportRow[] に変換する。
 *
 * - "account"ノードの値をそのまま使用する（補助科目の内訳は既に親科目の値に
 *   合算されているため、"sub_account"ノードには個別には立ち入らない。
 *   補助科目単位の取込は本システムのデータモデルが対応するまでの将来対応）。
 * - "settlement_balance"（決算整理仕訳）は会計期間の最終月に合算する。
 * - 勘定科目マスタ(getAccounts)に見つからない科目、BS科目、
 *   カテゴリ未対応の科目はスキップまたは分類未設定として警告に積む。
 * - `importBeforeYearMonth` 以降（未経過月）はスキップし、実績を作らない。
 */
export function convertMfTransitionPlToActualImportRows(
  report: MfTransitionPlReport,
  accounts: MfAccountSummary[],
  options: ConvertOptions = {},
): { rows: ActualImportRow[]; warnings: string[] } {
  const accountByName = new Map(accounts.map((a) => [a.name, a]));
  const rows: ActualImportRow[] = [];
  const warnings: string[] = [];
  const start = parseStartYearMonth(report.start_date);
  const monthCount = 12;
  const settlementIndex = report.columns.indexOf("settlement_balance");

  function visit(node: MfReportNode) {
    if (node.type === "account") {
      const meta = accountByName.get(node.name);
      if (!meta) {
        warnings.push(`勘定科目マスタに見つからないためスキップしました: ${node.name}`);
        return;
      }
      if (meta.financial_statement_type !== "PROFIT_LOSS") return; // PLのみ対応

      const plCategory = PL_CATEGORY_BY_MF_CATEGORY[meta.category];
      if (!plCategory) {
        warnings.push(`未対応のカテゴリ「${meta.category}」のため分類未設定で取り込みます: ${node.name}`);
      }

      const settlement = settlementIndex >= 0 ? (node.values[settlementIndex] ?? 0) : 0;
      for (let i = 0; i < monthCount; i++) {
        const ym = addMonths(start, i);
        if (options.importBeforeYearMonth && !isBefore(ym, options.importBeforeYearMonth)) continue;
        const amount = (node.values[i] ?? 0) + (i === monthCount - 1 ? settlement : 0);
        rows.push({
          accountCode: meta.id,
          accountName: meta.name,
          statement: "PL",
          plCategory,
          year: ym.year,
          month: ym.month,
          amount,
        });
      }
      return;
    }

    if (node.type === "financial_statement_item" && node.rows) {
      for (const child of node.rows) visit(child);
    }
    // "sub_account" は集計済みの親科目に含まれるため個別には取り込まない
  }

  for (const node of report.rows) visit(node);
  return { rows, warnings };
}
