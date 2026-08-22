// MFクラウド会計のMCPツールで取得した生JSON（勘定科目マスタ + 推移表PL）から
// 月次実績を取り込むCLI。JSON自体はMCP経由でClaudeが取得し、ファイルとして
// 保存したものを渡す想定（このスクリプト自体はMCP/ネットワークに依存しない）。
//
// 使い方:
//   npx tsx scripts/import-mf-transition-pl.ts \
//     --client "ステラリンクスグループ" \
//     --accounts /path/to/accounts.json \
//     --report /path/to/pl-2023.json --report /path/to/pl-2024.json ... \
//     [--as-of 2026-08]   # 省略時は実行時点の年月（この年月以降は未経過月としてスキップ）
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importMonthlyActuals } from "../src/lib/import/actuals";
import {
  convertMfTransitionPlToActualImportRows,
  type MfAccountSummary,
  type MfTransitionPlReport,
} from "../src/lib/import/mfCloudAdapter";

function parseArgs(argv: string[]): { client?: string; accounts?: string; reports: string[]; asOf?: string } {
  const result: { client?: string; accounts?: string; reports: string[]; asOf?: string } = { reports: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") result.client = argv[++i];
    if (argv[i] === "--accounts") result.accounts = argv[++i];
    if (argv[i] === "--report") result.reports.push(argv[++i]);
    if (argv[i] === "--as-of") result.asOf = argv[++i];
  }
  return result;
}

async function main() {
  const { client: clientName, accounts: accountsFile, reports, asOf } = parseArgs(process.argv.slice(2));
  if (!clientName || !accountsFile || reports.length === 0) {
    console.error(
      '使い方: npx tsx scripts/import-mf-transition-pl.ts --client "顧客名" --accounts accounts.json --report pl-2025.json [--report pl-2026.json ...] [--as-of YYYY-MM]',
    );
    process.exit(1);
  }

  const importBeforeYearMonth = asOf
    ? { year: Number(asOf.split("-")[0]), month: Number(asOf.split("-")[1]) }
    : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const client = await prisma.client.findFirst({ where: { name: clientName } });
    if (!client) {
      console.error(`顧客が見つかりません（先に作成してください）: ${clientName}`);
      process.exit(1);
    }

    const accounts: MfAccountSummary[] = JSON.parse(await readFile(accountsFile, "utf-8")).accounts;

    for (const reportFile of reports) {
      const report: MfTransitionPlReport = JSON.parse(await readFile(reportFile, "utf-8"));
      const { rows, warnings } = convertMfTransitionPlToActualImportRows(report, accounts, {
        importBeforeYearMonth,
      });
      const summary = await importMonthlyActuals(prisma, client.id, rows);

      console.log(`--- ${reportFile} (fiscal_year=${(report as { fiscal_year?: number }).fiscal_year}) ---`);
      console.log(`  変換行数: ${rows.length}`);
      console.log(`  新規作成した勘定科目: ${summary.createdAccounts.length}件`);
      for (const a of summary.createdAccounts) console.log(`    - ${a.name} (${a.code})`);
      console.log(`  月次実績: 新規${summary.createdMonthlyActuals}件 / 更新${summary.updatedMonthlyActuals}件`);
      const allWarnings = [...warnings, ...summary.warnings];
      if (allWarnings.length > 0) {
        console.log(`  警告 (${allWarnings.length}件):`);
        for (const w of allWarnings) console.log(`    - ${w}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
