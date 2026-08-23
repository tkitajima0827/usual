// 指定した顧客・会計年度の単年度計画を「全科目 過去平均」で初期生成するCLI。
// 実績データさえ取り込まれていればどの顧客にも使える汎用スクリプト。
// 生成後はブラウザの編集UIで、必要な科目だけ前年同額・科目連動・直接入力に
// 調整していく運用を想定している。
//
// 使い方:
//   npx tsx scripts/create-default-plan.ts --client "顧客名" --start-year 2027 --start-month 3 --label "2027年度"
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function parseArgs(argv: string[]) {
  const result: { client?: string; startYear?: string; startMonth?: string; label?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") result.client = argv[++i];
    if (argv[i] === "--start-year") result.startYear = argv[++i];
    if (argv[i] === "--start-month") result.startMonth = argv[++i];
    if (argv[i] === "--label") result.label = argv[++i];
  }
  return result;
}

async function main() {
  const { client: clientName, startYear, startMonth, label } = parseArgs(process.argv.slice(2));
  if (!clientName || !startYear || !startMonth) {
    console.error(
      '使い方: npx tsx scripts/create-default-plan.ts --client "顧客名" --start-year <YYYY> --start-month <1-12> [--label "表示名"]',
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const client = await prisma.client.findFirstOrThrow({ where: { name: clientName } });
    const accounts = await prisma.account.findMany({
      where: { clientId: client.id, isActive: true, statement: "PL" },
    });

    const fiscalYear = await prisma.fiscalYear.upsert({
      where: {
        clientId_startYear_startMonth: {
          clientId: client.id,
          startYear: Number(startYear),
          startMonth: Number(startMonth),
        },
      },
      create: {
        clientId: client.id,
        label: label ?? `${startYear}年度`,
        startYear: Number(startYear),
        startMonth: Number(startMonth),
      },
      update: {},
    });

    let created = 0;
    for (const account of accounts) {
      const existing = await prisma.planEntry.findUnique({
        where: { fiscalYearId_accountId: { fiscalYearId: fiscalYear.id, accountId: account.id } },
      });
      if (existing) continue;
      await prisma.planEntry.create({
        data: { fiscalYearId: fiscalYear.id, accountId: account.id, calcMethod: "PAST_AVERAGE" },
      });
      created++;
    }

    console.log(`作成しました: ${client.name} / ${fiscalYear.label} (fiscalYearId=${fiscalYear.id})`);
    console.log(`  対象科目: ${accounts.length}件 / 新規作成した計画設定: ${created}件`);
    console.log(`URL: /clients/${client.id}/plans/${fiscalYear.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
