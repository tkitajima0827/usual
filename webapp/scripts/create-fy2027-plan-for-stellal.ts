// ステラリンクスグループの実データを使って、実際の画面を確認するための
// FY2027単年度PL計画を作成する一回限りのスクリプト。
// 計算方式の割当てはデモ目的の簡易ルール:
//   - 売上高: 過去平均
//   - 外注費（原価）: 売上高に連動（過去実績比率から算出）
//   - 広告宣伝費: 直接入力（2025年実績×1.05を入力値として使用）
//   - 固定費性の科目（役員報酬・地代家賃など）: 前年同額
//   - それ以外: 過去平均
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const CLIENT_NAME = "ステラリンクスグループ";
const FIXED_COST_NAMES = ["役員報酬", "地代家賃", "法定福利費", "減価償却費", "繰延資産償却", "長期前払費用償却", "諸会費", "支払利息"];
const LINKED_NAME = "外注費（原価）";
const DIRECT_NAME = "広告宣伝費";
const REVENUE_NAME = "売上高";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const client = await prisma.client.findFirstOrThrow({ where: { name: CLIENT_NAME } });
    const accounts = await prisma.account.findMany({ where: { clientId: client.id, isActive: true } });
    const revenueAccount = accounts.find((a) => a.name === REVENUE_NAME);
    if (!revenueAccount) throw new Error(`${REVENUE_NAME} が見つかりません`);
    const linkedAccount = accounts.find((a) => a.name === LINKED_NAME);
    const directAccount = accounts.find((a) => a.name === DIRECT_NAME);

    const fiscalYear = await prisma.fiscalYear.upsert({
      where: { clientId_startYear_startMonth: { clientId: client.id, startYear: 2027, startMonth: 1 } },
      create: { clientId: client.id, label: "2027年度", startYear: 2027, startMonth: 1 },
      update: {},
    });

    // 外注費（原価）の連動割合を2025年実績から算出（平均月次比率）
    let linkedPercentage = 0;
    if (linkedAccount) {
      const [revenueActuals, linkedActuals] = await Promise.all([
        prisma.monthlyActual.findMany({ where: { accountId: revenueAccount.id, year: 2025 } }),
        prisma.monthlyActual.findMany({ where: { accountId: linkedAccount.id, year: 2025 } }),
      ]);
      const revenueTotal = revenueActuals.reduce((sum, r) => sum + Number(r.amount), 0);
      const linkedTotal = linkedActuals.reduce((sum, r) => sum + Number(r.amount), 0);
      linkedPercentage = revenueTotal !== 0 ? Math.round((linkedTotal / revenueTotal) * 1000) / 10 : 0;
      console.log(`${LINKED_NAME}の連動割合(2025年実績ベース): ${linkedPercentage}%`);
    }

    // 広告宣伝費の直接入力値（2025年実績×1.05）
    let directValues: { year: number; month: number; amount: number }[] = [];
    if (directAccount) {
      const actuals2025 = await prisma.monthlyActual.findMany({
        where: { accountId: directAccount.id, year: 2025 },
        orderBy: { month: "asc" },
      });
      directValues = actuals2025.map((a) => ({ year: 2027, month: a.month, amount: Math.round(Number(a.amount) * 1.05) }));
    }

    // 既存のPlanEntryをクリアして再作成（冪等に実行できるように）
    await prisma.planEntry.deleteMany({ where: { fiscalYearId: fiscalYear.id } });

    for (const account of accounts) {
      if (account.name === REVENUE_NAME) {
        await prisma.planEntry.create({
          data: { fiscalYearId: fiscalYear.id, accountId: account.id, calcMethod: "PAST_AVERAGE" },
        });
      } else if (account.name === LINKED_NAME) {
        await prisma.planEntry.create({
          data: {
            fiscalYearId: fiscalYear.id,
            accountId: account.id,
            calcMethod: "LINKED",
            linkedAccountId: revenueAccount.id,
            linkedPercentage,
          },
        });
      } else if (account.name === DIRECT_NAME) {
        await prisma.planEntry.create({
          data: {
            fiscalYearId: fiscalYear.id,
            accountId: account.id,
            calcMethod: "DIRECT",
            directValues: { create: directValues },
          },
        });
      } else if (FIXED_COST_NAMES.includes(account.name)) {
        await prisma.planEntry.create({
          data: { fiscalYearId: fiscalYear.id, accountId: account.id, calcMethod: "PREV_YEAR_SAME" },
        });
      } else {
        await prisma.planEntry.create({
          data: { fiscalYearId: fiscalYear.id, accountId: account.id, calcMethod: "PAST_AVERAGE" },
        });
      }
    }

    console.log(`作成しました: ${client.name} / ${fiscalYear.label} (fiscalYearId=${fiscalYear.id})`);
    console.log(`URL: /clients/${client.id}/plans/${fiscalYear.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
