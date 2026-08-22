import { prisma } from "@/lib/db";
import { calculatePlan, ymKey, type PlanEntryInput } from "@/lib/calc/engine";
import { PL_CATEGORY_LABEL } from "@/lib/labels";

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

export interface PlanAccountRow {
  accountId: string;
  code: string;
  name: string;
  plCategory: string;
  calcMethod: string;
  linkedAccountId?: string;
  linkedAccountName?: string;
  linkedPercentage?: number;
  months: number[]; // 12ヶ月分（期首月始まり）
  total: number;
  warnings: string[];
}

export interface PlanCategoryGroup {
  category: string;
  label: string;
  rows: PlanAccountRow[];
  monthTotals: number[];
  total: number;
}

export interface PlanViewModel {
  client: { id: string; name: string };
  fiscalYear: { id: string; label: string; startYear: number; startMonth: number };
  monthLabels: { year: number; month: number }[];
  categories: PlanCategoryGroup[];
  subtotals: {
    grossProfit: { monthTotals: number[]; total: number }; // 売上総利益
    operatingIncome: { monthTotals: number[]; total: number }; // 営業利益
    ordinaryIncome: { monthTotals: number[]; total: number }; // 経常利益
  };
  errors: string[];
}

const CATEGORY_ORDER = [
  "REVENUE",
  "COGS",
  "SGA",
  "NON_OPERATING_INCOME",
  "NON_OPERATING_EXPENSE",
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

  const monthLabels =
    result.accounts[0]?.months.map((m) => ({ year: m.year, month: m.month })) ??
    Array.from({ length: 12 }, (_, i) => {
      const total = fiscalYear.startYear * 12 + (fiscalYear.startMonth - 1) + i;
      return { year: Math.floor(total / 12), month: (total % 12) + 1 };
    });

  const categories: PlanCategoryGroup[] = CATEGORY_ORDER.map((category) => {
    const rows: PlanAccountRow[] = accounts
      .filter((a) => a.plCategory === category && entryByAccount.has(a.id))
      .map((account) => {
        const entry = entryByAccount.get(account.id)!;
        const computed = resultByAccount.get(account.id)!;
        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          plCategory: account.plCategory ?? category,
          calcMethod: entry.calcMethod,
          linkedAccountId: entry.linkedAccountId ?? undefined,
          linkedAccountName: entry.linkedAccount?.name,
          linkedPercentage: entry.linkedPercentage ? Number(entry.linkedPercentage) : undefined,
          months: computed.months.map((m) => m.amount),
          total: computed.total,
          warnings: computed.warnings,
        };
      });
    const monthTotals = sumArrays(
      rows.map((r) => r.months),
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
      grossProfit: { monthTotals: grossProfitMonths, total: grossProfitMonths.reduce((a, b) => a + b, 0) },
      operatingIncome: {
        monthTotals: operatingIncomeMonths,
        total: operatingIncomeMonths.reduce((a, b) => a + b, 0),
      },
      ordinaryIncome: {
        monthTotals: ordinaryIncomeMonths,
        total: ordinaryIncomeMonths.reduce((a, b) => a + b, 0),
      },
    },
    errors: result.errors,
  };
}
