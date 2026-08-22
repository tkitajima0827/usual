// 正規化済みJSON（ActualImportRow[]）から月次実績を取り込むCLI。
//
// 使い方:
//   npx tsx scripts/import-actuals.ts --client "テスト株式会社" --file fixtures/mf-import-example.json
//
// このスクリプト自体はMF固有の知識を持たない。CSVエクスポートやMFクラウド会計
// APIのレスポンスをこの正規化JSON形式に変換するアダプタは別途用意する
// （フォーマットが確定次第、src/lib/import 配下に追加する）。
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importMonthlyActuals, type ActualImportRow } from "../src/lib/import/actuals";

function parseArgs(argv: string[]): { client?: string; file?: string } {
  const result: { client?: string; file?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") result.client = argv[++i];
    if (argv[i] === "--file") result.file = argv[++i];
  }
  return result;
}

async function main() {
  const { client: clientName, file } = parseArgs(process.argv.slice(2));
  if (!clientName || !file) {
    console.error('使い方: npx tsx scripts/import-actuals.ts --client "顧客名" --file <JSONファイル>');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const client = await prisma.client.findFirst({ where: { name: clientName } });
    if (!client) {
      console.error(`顧客が見つかりません: ${clientName}`);
      process.exit(1);
    }

    const raw = await readFile(file, "utf-8");
    const rows: ActualImportRow[] = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      console.error("JSONファイルは ActualImportRow の配列である必要があります");
      process.exit(1);
    }

    const summary = await importMonthlyActuals(prisma, client.id, rows);

    console.log(`取込完了: ${clientName}`);
    console.log(`  新規作成した勘定科目: ${summary.createdAccounts.length}件`);
    for (const a of summary.createdAccounts) console.log(`    - ${a.name} (${a.code})`);
    console.log(`  月次実績: 新規${summary.createdMonthlyActuals}件 / 更新${summary.updatedMonthlyActuals}件`);
    if (summary.warnings.length > 0) {
      console.log(`  警告 (${summary.warnings.length}件):`);
      for (const w of summary.warnings) console.log(`    - ${w}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
