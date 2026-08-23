// 新規顧客(Client)レコードを作成するCLI。
//
// 使い方:
//   npx tsx scripts/create-client.ts --name "顧客名" --fiscal-start-month 4 --tax-method EXCLUSIVE
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function parseArgs(argv: string[]) {
  const result: { name?: string; fiscalStartMonth?: string; taxMethod?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name") result.name = argv[++i];
    if (argv[i] === "--fiscal-start-month") result.fiscalStartMonth = argv[++i];
    if (argv[i] === "--tax-method") result.taxMethod = argv[++i];
  }
  return result;
}

async function main() {
  const { name, fiscalStartMonth, taxMethod } = parseArgs(process.argv.slice(2));
  if (!name || !fiscalStartMonth || !taxMethod) {
    console.error(
      '使い方: npx tsx scripts/create-client.ts --name "顧客名" --fiscal-start-month <1-12> --tax-method <INCLUSIVE|EXCLUSIVE>',
    );
    process.exit(1);
  }
  if (taxMethod !== "INCLUSIVE" && taxMethod !== "EXCLUSIVE") {
    console.error("--tax-method は INCLUSIVE または EXCLUSIVE を指定してください");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.client.findFirst({ where: { name } });
    if (existing) {
      console.log(`既に存在します: ${name} (${existing.id})`);
      return;
    }
    const client = await prisma.client.create({
      data: {
        name,
        fiscalYearStartMonth: Number(fiscalStartMonth),
        taxMethod,
      },
    });
    console.log(`作成しました: ${client.name} (${client.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
