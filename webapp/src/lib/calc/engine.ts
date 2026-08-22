// 単年度PL計画の計算エンジン。DBに依存しない純粋関数として実装し、
// 単体テスト・UIプレビューの両方から呼べるようにする。

export type CalcMethod = "PREV_YEAR_SAME" | "LINKED" | "DIRECT" | "PAST_AVERAGE";

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface PlanEntryInput {
  accountId: string;
  calcMethod: CalcMethod;
  linkedAccountId?: string | null;
  linkedPercentage?: number | null; // 例: 60.5 は 60.5%
  /** DIRECT のときの月次入力値。キーは ymKey(year, month) */
  directValues?: Record<string, number>;
}

export interface EngineInput {
  fiscalYearStart: YearMonth;
  /** 計画対象の勘定科目ごとの設定（1勘定科目につき1件） */
  planEntries: PlanEntryInput[];
  /**
   * 計画開始月より前の実績値。 accountId -> ymKey(year, month) -> amount。
   * 前年同額・過去平均の算出に使う。
   */
  actuals: Map<string, Map<string, number>>;
}

export interface MonthlyPlanValue {
  year: number;
  month: number;
  amount: number;
}

export interface AccountPlanResult {
  accountId: string;
  months: MonthlyPlanValue[];
  total: number;
  /** この科目の計算で参照データが欠けていた場合の警告 */
  warnings: string[];
}

export interface EngineResult {
  accounts: AccountPlanResult[];
  /** 循環参照など、致命的なエラー */
  errors: string[];
}

export function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function fiscalYearMonths(start: YearMonth): YearMonth[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
}

/**
 * 単年度PL計画を計算する。
 *
 * 月を暦順（期首月→期末月）に処理し、各月内では LINKED（科目連動）の依存関係を
 * トポロジカルソートしてから計算する。過去平均・前年同額は、計画年度より前は
 * actuals、計画年度に入ってからは同一年度内で既に計算済みの値を参照する
 * （ローリング12ヶ月平均として扱う）。
 */
export function calculatePlan(input: EngineInput): EngineResult {
  const { fiscalYearStart, planEntries, actuals } = input;
  const months = fiscalYearMonths(fiscalYearStart);
  const entryByAccount = new Map(planEntries.map((e) => [e.accountId, e]));

  // computed[accountId][ymKey] = amount（計画年度内の確定値）
  const computed = new Map<string, Map<string, number>>();
  const warnings = new Map<string, string[]>();
  for (const e of planEntries) {
    computed.set(e.accountId, new Map());
    warnings.set(e.accountId, []);
  }

  const errors: string[] = [];

  function getHistoricalOrComputed(accountId: string, ym: YearMonth): number | undefined {
    const key = ymKey(ym.year, ym.month);
    const computedForAccount = computed.get(accountId);
    if (computedForAccount?.has(key)) return computedForAccount.get(key);
    return actuals.get(accountId)?.get(key);
  }

  for (const ym of months) {
    // この月に計算が必要な科目のうち、LINKED の依存関係を解決する
    const pending = new Set(planEntries.map((e) => e.accountId));
    const order: PlanEntryInput[] = [];
    const visiting = new Set<string>();

    function visit(accountId: string, path: string[]): void {
      if (!pending.has(accountId)) return;
      if (visiting.has(accountId)) {
        errors.push(
          `科目連動が循環参照しています: ${[...path, accountId].join(" → ")}`,
        );
        pending.delete(accountId);
        return;
      }
      const entry = entryByAccount.get(accountId);
      if (!entry) return;
      if (entry.calcMethod === "LINKED" && entry.linkedAccountId) {
        if (entryByAccount.has(entry.linkedAccountId)) {
          visiting.add(accountId);
          visit(entry.linkedAccountId, [...path, accountId]);
          visiting.delete(accountId);
        }
      }
      if (pending.has(accountId)) {
        pending.delete(accountId);
        order.push(entry);
      }
    }

    for (const e of planEntries) visit(e.accountId, []);

    for (const entry of order) {
      const key = ymKey(ym.year, ym.month);
      let amount: number;

      switch (entry.calcMethod) {
        case "DIRECT": {
          const v = entry.directValues?.[key];
          if (v === undefined) {
            warnings.get(entry.accountId)!.push(`${key}: 直接入力値が未設定のため0円として扱いました`);
            amount = 0;
          } else {
            amount = v;
          }
          break;
        }
        case "PREV_YEAR_SAME": {
          const prevYm = addMonths(ym, -12);
          const v = getHistoricalOrComputed(entry.accountId, prevYm);
          if (v === undefined) {
            warnings.get(entry.accountId)!.push(`${key}: 前年同月(${ymKey(prevYm.year, prevYm.month)})の実績が見つからないため0円として扱いました`);
            amount = 0;
          } else {
            amount = v;
          }
          break;
        }
        case "LINKED": {
          if (!entry.linkedAccountId || entry.linkedPercentage == null) {
            warnings.get(entry.accountId)!.push(`${key}: 連動先科目または割合が未設定のため0円として扱いました`);
            amount = 0;
            break;
          }
          const base = getHistoricalOrComputed(entry.linkedAccountId, ym);
          if (base === undefined) {
            warnings.get(entry.accountId)!.push(`${key}: 連動先科目の値が見つからないため0円として扱いました`);
            amount = 0;
          } else {
            amount = base * (entry.linkedPercentage / 100);
          }
          break;
        }
        case "PAST_AVERAGE": {
          const windowMonths = Array.from({ length: 12 }, (_, i) => addMonths(ym, -12 + i));
          const values = windowMonths.map((m) => getHistoricalOrComputed(entry.accountId, m));
          const found = values.filter((v): v is number => v !== undefined);
          if (found.length === 0) {
            warnings.get(entry.accountId)!.push(`${key}: 過去12ヶ月の実績が見つからないため0円として扱いました`);
            amount = 0;
          } else {
            if (found.length < 12) {
              warnings.get(entry.accountId)!.push(
                `${key}: 過去12ヶ月のうち${12 - found.length}ヶ月分のデータが欠けています（${found.length}ヶ月分の平均で算出）`,
              );
            }
            amount = found.reduce((a, b) => a + b, 0) / found.length;
          }
          break;
        }
      }

      computed.get(entry.accountId)!.set(key, amount);
    }
  }

  const accounts: AccountPlanResult[] = planEntries.map((entry) => {
    const monthValues = months.map((ym) => ({
      year: ym.year,
      month: ym.month,
      amount: computed.get(entry.accountId)!.get(ymKey(ym.year, ym.month)) ?? 0,
    }));
    return {
      accountId: entry.accountId,
      months: monthValues,
      total: monthValues.reduce((a, b) => a + b.amount, 0),
      warnings: warnings.get(entry.accountId) ?? [],
    };
  });

  return { accounts, errors };
}
