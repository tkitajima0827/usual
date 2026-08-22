import { prisma } from "@/lib/db";
import { addMonths, calculatePlan, ymKey, type PlanEntryInput, type YearMonth } from "@/lib/calc/engine";
import { PL_CATEGORY_LABEL } from "@/lib/labels";
import { estimateConsumptionTax, estimateCorporateTax, estimateInterimPayment } from "@/lib/tax/estimate";

export async function getClients() {
  return prisma.client.findMany({ orderBy: { name: "asc" } });
}

export async function getClient(clientId: string) {
  return prisma.client.findUniqueOrThrow({ where: { id: clientId } });
}

export async function getFiscalYears(clientId: string) {
  return prisma.fiscalYear.findMany({
    where: { clientId },
    orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
  });
}

export interface PlanMonthValue {
  amount: number;
  /** 実績が判明していて、その値がそのまま採用されている月かどうか */
  isActual: boolean;
}

export interface PlanAccountRow {
  accountId: string;
  code: string;
  name: string;
  plCategory: string;
  calcMethod: string;
  linkedAccountId?: string;
  linkedAccountName?: string;
  linkedPercentage?: number;
  months: PlanMonthValue[]; // 12ヶ月分（期首月始まり）
  total: number;
  /** 前期（1年前）の同月実績。bixid風の前期/当期比較表示に使う */
  priorYearMonths: (number | null)[];
  priorYearTotal: number | null;
  warnings: string[];
  /** 消費税の課税区分（課税/非課税/対象外）。概算計算の対象科目の絞り込みに使う */
  consumptionTaxCategory: string;
}

export interface PlanCategoryGroup {
  category: string;
  label: string;
  rows: PlanAccountRow[];
  monthTotals: number[];
  total: number;
}

export interface PlanSubtotal {
  monthTotals: number[];
  total: number;
  /** 売上高に対する構成比（月次）。売上高が0の月はnull */
  marginByMonth: (number | null)[];
  margin: number | null;
}

export interface TaxEstimateViewModel {
  settings: {
    effectiveTaxRatePercent: number;
    lossCarryforward: number;
    consumptionTaxRatePercent: number;
    priorYearCorporateTaxAnnual: number | null;
    priorYearConsumptionTaxAnnual: number | null;
  };
  /** 課税売上高・課税仕入高（年間、消費税概算計算の元になる金額） */
  taxableRevenue: number;
  taxableExpense: number;
  corporateTax: { taxableIncome: number; estimatedAnnualTax: number };
  consumptionTax: { estimatedAnnualTax: number };
  corporateTaxInterim: number | null;
  consumptionTaxInterim: number | null;
}

export interface PlanViewModel {
  client: { id: string; name: string };
  fiscalYear: { id: string; label: string; startYear: number; startMonth: number };
  /** isActual: 今日時点で既に経過した月（実績が確定しているはずの月）かどうか */
  monthLabels: { year: number; month: number; isActual: boolean }[];
  categories: PlanCategoryGroup[];
  subtotals: {
    grossProfit: PlanSubtotal; // 売上総利益
    operatingIncome: PlanSubtotal; // 営業利益
    ordinaryIncome: PlanSubtotal; // 経常利益
    pretaxIncome: PlanSubtotal; // 税引前当期純利益
    netIncome: PlanSubtotal; // 当期純利益
  };
  taxEstimate: TaxEstimateViewModel;
  errors: string[];
}

function isElapsedMonth(ym: YearMonth, today: YearMonth): boolean {
  return ym.year * 12 + ym.month < today.year * 12 + today.month;
}

function marginOf(values: number[], revenue: number[]): (number | null)[] {
  return values.map((v, i) => (revenue[i] ? v / revenue[i] : null));
}

const CATEGORY_ORDER = [
  "REVENUE",
  "COGS",
  "SGA",
  "NON_OPERATING_INCOME",
  "NON_OPERATING_EXPENSE",
  "EXTRAORDINARY_INCOME",
  "EXTRAORDINARY_LOSS",
  "INCOME_TAXES",
] as const;

function sumArrays(arrays: number[][], length: number): number[] {
  const result = new Array(length).fill(0);
  for (const arr of arrays) {
    for (let i = 0; i < length; i++) result[i] += arr[i] ?? 0;
  }
  return result;
}

export async function getPlanViewModel(fiscalYearId: string): Promise<PlanViewModel> {
  const fiscalYear = await prisma.fiscalYear.findUniqueOrThrow({
    where: { id: fiscalYearId },
    include: { client: true },
  });

  const accounts = await prisma.account.findMany({
    where: { clientId: fiscalYear.clientId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const planEntries = await prisma.planEntry.findMany({
    where: { fiscalYearId },
    include: { directValues: true, linkedAccount: true },
  });

  const actualRows = await prisma.monthlyActual.findMany({
    where: { clientId: fiscalYear.clientId },
  });
  const actuals = new Map<string, Map<string, number>>();
  for (const row of actualRows) {
    if (!actuals.has(row.accountId)) actuals.set(row.accountId, new Map());
    actuals.get(row.accountId)!.set(ymKey(row.year, row.month), Number(row.amount));
  }

  const engineEntries: PlanEntryInput[] = planEntries.map((entry) => ({
    accountId: entry.accountId,
    calcMethod: entry.calcMethod,
    linkedAccountId: entry.linkedAccountId,
    linkedPercentage: entry.linkedPercentage ? Number(entry.linkedPercentage) : null,
    directValues: Object.fromEntries(
      entry.directValues.map((dv) => [ymKey(dv.year, dv.month), Number(dv.amount)]),
    ),
  }));

  const result = calculatePlan({
    fiscalYearStart: { year: fiscalYear.startYear, month: fiscalYear.startMonth },
    planEntries: engineEntries,
    actuals,
  });

  const resultByAccount = new Map(result.accounts.map((a) => [a.accountId, a]));
  const entryByAccount = new Map(planEntries.map((e) => [e.accountId, e]));

  const rawMonths: YearMonth[] =
    result.accounts[0]?.months.map((m) => ({ year: m.year, month: m.month })) ??
    Array.from({ length: 12 }, (_, i) => {
      const total = fiscalYear.startYear * 12 + (fiscalYear.startMonth - 1) + i;
      return { year: Math.floor(total / 12), month: (total % 12) + 1 };
    });

  const now = new Date();
  const today: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const monthLabels = rawMonths.map((ym) => ({ ...ym, isActual: isElapsedMonth(ym, today) }));

  const categories: PlanCategoryGroup[] = CATEGORY_ORDER.map((category) => {
    const rows: PlanAccountRow[] = accounts
      .filter((a) => a.plCategory === category && entryByAccount.has(a.id))
      .map((account) => {
        const entry = entryByAccount.get(account.id)!;
        const computed = resultByAccount.get(account.id)!;
        const priorYearMonths = rawMonths.map((ym) => {
          const prevYm = addMonths(ym, -12);
          return actuals.get(account.id)?.get(ymKey(prevYm.year, prevYm.month)) ?? null;
        });
        const priorYearKnown = priorYearMonths.filter((v): v is number => v !== null);
        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          plCategory: account.plCategory ?? category,
          calcMethod: entry.calcMethod,
          linkedAccountId: entry.linkedAccountId ?? undefined,
          linkedAccountName: entry.linkedAccount?.name,
          linkedPercentage: entry.linkedPercentage ? Number(entry.linkedPercentage) : undefined,
          months: computed.months.map((m) => ({ amount: m.amount, isActual: m.isActual })),
          total: computed.total,
          priorYearMonths,
          priorYearTotal: priorYearKnown.length > 0 ? priorYearKnown.reduce((a, b) => a + b, 0) : null,
          warnings: computed.warnings,
          consumptionTaxCategory: account.consumptionTaxCategory,
        };
      });
    const monthTotals = sumArrays(
      rows.map((r) => r.months.map((m) => m.amount)),
      12,
    );
    return {
      category,
      label: PL_CATEGORY_LABEL[category],
      rows,
      monthTotals,
      total: monthTotals.reduce((a, b) => a + b, 0),
    };
  });

  const byCategory = Object.fromEntries(categories.map((c) => [c.category, c]));
  const revenueMonths = byCategory.REVENUE.monthTotals;
  const grossProfitMonths = sumArrays(
    [byCategory.REVENUE.monthTotals, byCategory.COGS.monthTotals.map((v) => -v)],
    12,
  );
  const sgaMonths = byCategory.SGA.monthTotals;
  const operatingIncomeMonths = sumArrays([grossProfitMonths, sgaMonths.map((v) => -v)], 12);
  const ordinaryIncomeMonths = sumArrays(
    [
      operatingIncomeMonths,
      byCategory.NON_OPERATING_INCOME.monthTotals,
      byCategory.NON_OPERATING_EXPENSE.monthTotals.map((v) => -v),
    ],
    12,
  );
  const pretaxIncomeMonths = sumArrays(
    [
      ordinaryIncomeMonths,
      byCategory.EXTRAORDINARY_INCOME.monthTotals,
      byCategory.EXTRAORDINARY_LOSS.monthTotals.map((v) => -v),
    ],
    12,
  );
  const netIncomeMonths = sumArrays(
    [pretaxIncomeMonths, byCategory.INCOME_TAXES.monthTotals.map((v) => -v)],
    12,
  );
  const revenueTotal = revenueMonths.reduce((a, b) => a + b, 0);

  function buildSubtotal(monthTotals: number[]): PlanSubtotal {
    const total = monthTotals.reduce((a, b) => a + b, 0);
    return {
      monthTotals,
      total,
      marginByMonth: marginOf(monthTotals, revenueMonths),
      margin: revenueTotal ? total / revenueTotal : null,
    };
  }

  // 消費税の概算（本則課税）: 課税区分が「課税」の科目のみを対象に、
  // 課税売上高（REVENUE）と課税仕入高（COGS+SGA）を集計する
  let taxableRevenue = 0;
  let taxableExpense = 0;
  for (const account of accounts) {
    if (account.consumptionTaxCategory !== "TAXABLE") continue;
    const computed = resultByAccount.get(account.id);
    if (!computed) continue;
    if (account.plCategory === "REVENUE") taxableRevenue += computed.total;
    else if (account.plCategory === "COGS" || account.plCategory === "SGA") taxableExpense += computed.total;
  }

  const taxSettings = await prisma.taxSettings.findUnique({ where: { fiscalYearId } });
  const effectiveTaxRatePercent = taxSettings ? Number(taxSettings.effectiveTaxRate) : 33;
  const lossCarryforward = taxSettings ? Number(taxSettings.lossCarryforward) : 0;
  const consumptionTaxRatePercent = taxSettings ? Number(taxSettings.consumptionTaxRate) : 10;
  const priorYearCorporateTaxAnnual =
    taxSettings?.priorYearCorporateTaxAnnual != null ? Number(taxSettings.priorYearCorporateTaxAnnual) : null;
  const priorYearConsumptionTaxAnnual =
    taxSettings?.priorYearConsumptionTaxAnnual != null ? Number(taxSettings.priorYearConsumptionTaxAnnual) : null;

  const pretaxIncomeTotal = pretaxIncomeMonths.reduce((a, b) => a + b, 0);
  const corporateTax = estimateCorporateTax({
    pretaxIncome: pretaxIncomeTotal,
    effectiveTaxRatePercent,
    lossCarryforward,
  });
  const consumptionTax = estimateConsumptionTax({
    taxableRevenue,
    taxableExpense,
    ratePercent: consumptionTaxRatePercent,
  });

  return {
    client: { id: fiscalYear.client.id, name: fiscalYear.client.name },
    fiscalYear: {
      id: fiscalYear.id,
      label: fiscalYear.label,
      startYear: fiscalYear.startYear,
      startMonth: fiscalYear.startMonth,
    },
    monthLabels,
    categories,
    subtotals: {
      grossProfit: buildSubtotal(grossProfitMonths),
      operatingIncome: buildSubtotal(operatingIncomeMonths),
      ordinaryIncome: buildSubtotal(ordinaryIncomeMonths),
      pretaxIncome: buildSubtotal(pretaxIncomeMonths),
      netIncome: buildSubtotal(netIncomeMonths),
    },
    taxEstimate: {
      settings: {
        effectiveTaxRatePercent,
        lossCarryforward,
        consumptionTaxRatePercent,
        priorYearCorporateTaxAnnual,
        priorYearConsumptionTaxAnnual,
      },
      taxableRevenue,
      taxableExpense,
      corporateTax,
      consumptionTax,
      corporateTaxInterim: estimateInterimPayment(priorYearCorporateTaxAnnual),
      consumptionTaxInterim: estimateInterimPayment(priorYearConsumptionTaxAnnual),
    },
    errors: result.errors,
  };
}
