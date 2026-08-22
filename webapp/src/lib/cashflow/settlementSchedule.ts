// 回収・支払サイト（締め日・何ヶ月後・回収/支払日）から、月次のPL計画金額を
// 「実際に入出金される予定月」へシフトするための純粋計算。DBに依存しない。
//
// 簡略化: 締め日・回収/支払日は月内の「何日か」を表す情報だが、本システムの
// 実績・計画データは暦月単位（MonthlyActual/PlanEntry）でしか持っていないため、
// 月内のどの日に入出金されるかは月次バケットの結果に影響しない
// （「20日締め翌月10日払い」も「末締め翌月末払い」も、月次で見れば
// どちらも『発生月の1ヶ月後』に入出金される点は変わらないため）。
// したがって月次シフト計算では monthsAfter のみを用い、closingDay/settlementDay は
// 画面表示・bixid相当のデータ入力項目として保持するにとどめる。

export interface SettlementTerm {
  /** 締め日 (1-31、31は月末扱い) */
  closingDay: number;
  /** 何ヶ月後に回収/支払するか（翌月=1、翌々月=2 ...） */
  monthsAfter: number;
  /** 回収/支払日 (1-31、31は月末扱い) */
  settlementDay: number;
}

export const FALLBACK_SETTLEMENT_TERM: SettlementTerm = {
  closingDay: 31,
  monthsAfter: 1,
  settlementDay: 31,
};

export interface SettlementTermOverride {
  closingDay?: number | null;
  monthsAfter?: number | null;
  settlementDay?: number | null;
}

/**
 * 科目ごとの個別サイト設定（3項目すべて設定されている場合のみ）を、
 * 事業者共通の既定サイトより優先して採用する。どちらも無ければフォールバックを使う。
 */
export function resolveSettlementTerm(
  accountOverride: SettlementTermOverride | null | undefined,
  clientDefault: SettlementTerm | null | undefined,
): SettlementTerm {
  if (
    accountOverride?.closingDay != null &&
    accountOverride?.monthsAfter != null &&
    accountOverride?.settlementDay != null
  ) {
    return {
      closingDay: accountOverride.closingDay,
      monthsAfter: accountOverride.monthsAfter,
      settlementDay: accountOverride.settlementDay,
    };
  }
  return clientDefault ?? FALLBACK_SETTLEMENT_TERM;
}

export interface MonthAmount {
  year: number;
  month: number;
  amount: number;
}

/** 各月の金額を、指定したサイトに従って monthsAfter ヶ月先の暦月へシフトする */
export function shiftMonthlyAmounts(months: MonthAmount[], term: SettlementTerm): MonthAmount[] {
  return months.map((m) => {
    const total = m.year * 12 + (m.month - 1) + term.monthsAfter;
    return { year: Math.floor(total / 12), month: (total % 12) + 1, amount: m.amount };
  });
}

/**
 * 発生ベースの月次金額（sourceMonths、年度開始前の繰越分を含んでよい）をサイトに従って
 * シフトし、fiscalMonths（会計年度の12ヶ月）の範囲に入るものだけを月次合計として返す。
 * 年度末近くに発生し、翌年度にシフトされる分は（翌年度側の予定表の範囲となるため）含まない。
 */
export function buildSettlementSchedule(params: {
  fiscalMonths: { year: number; month: number }[];
  sourceMonths: MonthAmount[];
  term: SettlementTerm;
}): number[] {
  const shifted = shiftMonthlyAmounts(params.sourceMonths, params.term);
  const indexByKey = new Map(params.fiscalMonths.map((ym, i) => [`${ym.year}-${ym.month}`, i]));
  const result = new Array(params.fiscalMonths.length).fill(0);
  for (const s of shifted) {
    const i = indexByKey.get(`${s.year}-${s.month}`);
    if (i !== undefined) result[i] += s.amount;
  }
  return result;
}
