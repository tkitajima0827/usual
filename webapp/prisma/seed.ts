// テストデータ投入スクリプト。
// 単一顧客（テスト株式会社）に、過去2期分の月次実績と、
// 4つの計算方式を組み合わせた単年度PL計画（FY2026）を作成する。
//
// 実行: npm run db:seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { classifyConsumptionTax } from "../src/lib/tax/classifyConsumptionTax";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CLIENT_NAME = "テスト株式会社";

// FY2024: 2024-04 ~ 2025-03, FY2025: 2025-04 ~ 2026-03 の実績を
// 季節性を持たせて生成する（決算月3月・賞与月6,12月に増える想定）。
function monthlyActualSeries(
  base: number,
  opts: { growthPerMonth?: number; seasonal?: (month: number) => number } = {},
): number[] {
  const { growthPerMonth = 0, seasonal = () => 1 } = opts;
  const months: number[] = [];
  let month = 4;
  for (let i = 0; i < 24; i++) {
    const trend = base + growthPerMonth * i;
    months.push(Math.round(trend * seasonal(month)));
    month++;
    if (month > 12) month = 1;
  }
  return months;
}

function seasonalSales(month: number): number {
  if (month === 12) return 1.3; // 年末商戦
  if (month === 3) return 1.2; // 決算前
  if (month === 8) return 0.85; // 夏枯れ
  return 1;
}

function seasonalLabor(month: number): number {
  if (month === 6 || month === 12) return 1.8; // 賞与月
  return 1;
}

async function seedMonthlyActuals(
  clientId: string,
  accountId: string,
  values: number[],
) {
  let year = 2024;
  let month = 4;
  for (const amount of values) {
    await prisma.monthlyActual.upsert({
      where: { accountId_year_month: { accountId, year, month } },
      create: { clientId, accountId, year, month, amount },
      update: { amount },
    });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
}

async function main() {
  const existing = await prisma.client.findFirst({ where: { name: CLIENT_NAME } });
  if (existing) {
    await prisma.client.delete({ where: { id: existing.id } });
  }

  const client = await prisma.client.create({
    data: {
      name: CLIENT_NAME,
      fiscalYearStartMonth: 4,
      taxMethod: "EXCLUSIVE",
      users: {
        create: [
          { email: "staff@stella-l.com", name: "担当スタッフ", role: "FIRM_STAFF" },
          { email: "client-admin@test-kk.example.com", name: "テスト株式会社 経理担当", role: "CLIENT_ADMIN" },
        ],
      },
    },
  });

  type AccountSeed = {
    code: string;
    name: string;
    plCategory: Prisma.AccountCreateInput["plCategory"];
    sortOrder: number;
    actuals: number[];
    /** 名称からの自動推定では正しく判定できない科目のみ明示指定する（例: 給与を含む集計科目） */
    consumptionTaxCategoryOverride?: Prisma.AccountCreateInput["consumptionTaxCategory"];
  };

  const accountSeeds: AccountSeed[] = [
    {
      code: "4000",
      name: "売上高",
      plCategory: "REVENUE",
      sortOrder: 10,
      actuals: monthlyActualSeries(10_000_000, { growthPerMonth: 40_000, seasonal: seasonalSales }),
    },
    {
      code: "5000",
      name: "売上原価",
      plCategory: "COGS",
      sortOrder: 20,
      actuals: monthlyActualSeries(5_600_000, { growthPerMonth: 22_000, seasonal: seasonalSales }),
    },
    {
      code: "6100",
      name: "人件費",
      plCategory: "SGA",
      sortOrder: 30,
      actuals: monthlyActualSeries(2_200_000, { seasonal: seasonalLabor }),
      consumptionTaxCategoryOverride: "OUT_OF_SCOPE", // 給与・賞与の集計科目のため対象外（自動推定は科目名だけでは判定できない）
    },
    {
      code: "6200",
      name: "地代家賃",
      plCategory: "SGA",
      sortOrder: 40,
      actuals: monthlyActualSeries(500_000),
    },
    {
      code: "6300",
      name: "広告宣伝費",
      plCategory: "SGA",
      sortOrder: 50,
      actuals: monthlyActualSeries(300_000, { seasonal: (m) => (m === 12 ? 1.5 : 1) }),
    },
    {
      code: "6400",
      name: "消耗品費",
      plCategory: "SGA",
      sortOrder: 60,
      actuals: monthlyActualSeries(120_000, { seasonal: (m) => (m % 3 === 0 ? 1.4 : 0.9) }),
    },
    {
      code: "6500",
      name: "減価償却費",
      plCategory: "SGA",
      sortOrder: 70,
      actuals: monthlyActualSeries(180_000),
    },
    {
      code: "6900",
      name: "その他販管費",
      plCategory: "SGA",
      sortOrder: 80,
      actuals: monthlyActualSeries(90_000, { seasonal: (m) => (m === 3 ? 1.6 : 1) }),
    },
    {
      code: "7100",
      name: "受取利息",
      plCategory: "NON_OPERATING_INCOME",
      sortOrder: 90,
      actuals: monthlyActualSeries(1_500),
    },
    {
      code: "7200",
      name: "支払利息",
      plCategory: "NON_OPERATING_EXPENSE",
      sortOrder: 100,
      actuals: monthlyActualSeries(25_000),
    },
    {
      code: "8100",
      name: "法人税、住民税及び事業税",
      plCategory: "INCOME_TAXES",
      sortOrder: 110,
      actuals: monthlyActualSeries(1_200_000, { seasonal: (m) => (m === 5 ? 1 : 0) }), // 5月に前期分をまとめて計上する想定
    },
  ];

  const accountsByCode: Record<string, { id: string }> = {};
  for (const seed of accountSeeds) {
    const account = await prisma.account.create({
      data: {
        clientId: client.id,
        code: seed.code,
        name: seed.name,
        statement: "PL",
        plCategory: seed.plCategory,
        sortOrder: seed.sortOrder,
        consumptionTaxCategory: seed.consumptionTaxCategoryOverride ?? classifyConsumptionTax(seed.name),
      },
    });
    accountsByCode[seed.code] = account;
    await seedMonthlyActuals(client.id, account.id, seed.actuals);
  }

  const fiscalYear = await prisma.fiscalYear.create({
    data: {
      clientId: client.id,
      label: "2026年度",
      startYear: 2026,
      startMonth: 4,
    },
  });

  // 計画方式の割当て（4方式のデモ）
  const salesId = accountsByCode["4000"].id;

  const directGrowthTarget = (baseMonthAmount: number) => Math.round(baseMonthAmount * 1.08);

  // 売上高: 直接入力（前年同月実績の8%増を目標値として入力）
  const salesFy2025Actuals = monthlyActualSeries(10_000_000, { growthPerMonth: 40_000, seasonal: seasonalSales }).slice(12);
  const salesDirectValues: Record<string, number> = {};
  let y = 2026, m = 4;
  for (const prevAmount of salesFy2025Actuals) {
    salesDirectValues[`${y}-${String(m).padStart(2, "0")}`] = directGrowthTarget(prevAmount);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  await prisma.planEntry.create({
    data: {
      fiscalYearId: fiscalYear.id,
      accountId: salesId,
      calcMethod: "DIRECT",
      directValues: {
        create: Object.entries(salesDirectValues).map(([key, amount]) => {
          const [yy, mm] = key.split("-").map(Number);
          return { year: yy, month: mm, amount };
        }),
      },
    },
  });

  await prisma.planEntry.create({
    data: {
      fiscalYearId: fiscalYear.id,
      accountId: accountsByCode["5000"].id,
      calcMethod: "LINKED",
      linkedAccountId: salesId,
      linkedPercentage: 55,
    },
  });

  const prevYearSameAccounts = ["6100", "6200", "6500", "7200"];
  for (const code of prevYearSameAccounts) {
    await prisma.planEntry.create({
      data: {
        fiscalYearId: fiscalYear.id,
        accountId: accountsByCode[code].id,
        calcMethod: "PREV_YEAR_SAME",
      },
    });
  }

  const pastAverageAccounts = ["6400", "6900", "7100", "8100"];
  for (const code of pastAverageAccounts) {
    await prisma.planEntry.create({
      data: {
        fiscalYearId: fiscalYear.id,
        accountId: accountsByCode[code].id,
        calcMethod: "PAST_AVERAGE",
      },
    });
  }

  // 広告宣伝費: 直接入力（キャンペーン計画を手入力する想定、ここでは前年同月をベースに入力）
  const adActuals = accountSeeds.find((a) => a.code === "6300")!.actuals.slice(12);
  const adDirectValues: Record<string, { year: number; month: number; amount: number }> = {};
  y = 2026; m = 4;
  for (const prevAmount of adActuals) {
    adDirectValues[`${y}-${m}`] = { year: y, month: m, amount: prevAmount };
    m++;
    if (m > 12) { m = 1; y++; }
  }
  await prisma.planEntry.create({
    data: {
      fiscalYearId: fiscalYear.id,
      accountId: accountsByCode["6300"].id,
      calcMethod: "DIRECT",
      directValues: { create: Object.values(adDirectValues) },
    },
  });

  // 税額概算のデモ用設定（bixidの「申告データ登録」相当）。前期(FY2025)の
  // 実績年税額を概算した値を入れ、中間納付額の表示を確認できるようにする。
  await prisma.taxSettings.create({
    data: {
      fiscalYearId: fiscalYear.id,
      effectiveTaxRate: 33,
      lossCarryforward: 0,
      consumptionTaxRate: 10,
      priorYearCorporateTaxAnnual: 4_500_000,
      priorYearConsumptionTaxAnnual: 3_800_000,
    },
  });

  console.log(`Seed完了: client=${client.name} (${client.id}), fiscalYear=${fiscalYear.label} (${fiscalYear.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
