// MFクラウド会計など外部の会計データソースから月次実績を取り込むための
// 正規化レイヤー。CSVエクスポート・公式API・MCP経由のいずれから取得した
// データも、まずこの ActualImportRow 形式に変換してから importMonthlyActuals
// に渡す。データソースごとの違い（列名・APIレスポンス構造）はアダプタ側で
// 吸収し、この関数自体はソースを一切知らない。
import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { classifyConsumptionTax } from "@/lib/tax/classifyConsumptionTax";

export interface ActualImportRow {
  /** MF側の勘定科目コード。無い場合は accountName から安定的なコードを生成する */
  accountCode?: string;
  accountName: string;
  /** 新規科目作成時のみ使用。既存科目にマッチした場合は無視される */
  statement?: "PL" | "BS" | "CF";
  plCategory?: Prisma.AccountCreateInput["plCategory"];
  year: number;
  month: number;
  amount: number;
}

export interface ImportSummary {
  createdAccounts: { code: string; name: string }[];
  createdMonthlyActuals: number;
  updatedMonthlyActuals: number;
  warnings: string[];
}

function deriveCodeFromName(name: string): string {
  // MF側にコードが無い科目用の安定コード（同じ名前なら常に同じコードになる）
  return `NM-${name}`;
}

/**
 * 正規化済みの実績行を、指定した顧客の Account / MonthlyActual に取り込む。
 * 同じ (accountCode, year, month) の組み合わせは再実行しても安全（upsert）。
 * 未知の勘定科目は自動作成するが、plCategory が分からない場合は null のまま
 * 作成し、警告に積む（後で担当者が手動で分類する運用を想定）。
 */
export async function importMonthlyActuals(
  prisma: PrismaClient,
  clientId: string,
  rows: ActualImportRow[],
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    createdAccounts: [],
    createdMonthlyActuals: 0,
    updatedMonthlyActuals: 0,
    warnings: [],
  };

  const existingAccounts = await prisma.account.findMany({ where: { clientId } });
  const accountByCode = new Map(existingAccounts.map((a) => [a.code, a]));
  let nextSortOrder = existingAccounts.reduce((max, a) => Math.max(max, a.sortOrder), 0) + 10;

  for (const row of rows) {
    if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
      summary.warnings.push(`不正な月をスキップしました: ${row.accountName} ${row.year}-${row.month}`);
      continue;
    }

    const code = row.accountCode?.trim() || deriveCodeFromName(row.accountName);
    let account = accountByCode.get(code);
    if (!account) {
      account = await prisma.account.create({
        data: {
          clientId,
          code,
          name: row.accountName,
          statement: row.statement ?? "PL",
          plCategory: row.plCategory,
          sortOrder: nextSortOrder,
          // 消費税課税区分の初期値は科目名からの推定。必要に応じて画面から手動で上書きする。
          consumptionTaxCategory: classifyConsumptionTax(row.accountName),
        },
      });
      nextSortOrder += 10;
      accountByCode.set(code, account);
      summary.createdAccounts.push({ code, name: row.accountName });
      if (!row.plCategory) {
        summary.warnings.push(
          `新規科目「${row.accountName}」(${code}) は分類未設定で作成しました。PL表示に含めるには plCategory の設定が必要です。`,
        );
      }
    }

    const existing = await prisma.monthlyActual.findUnique({
      where: { accountId_year_month: { accountId: account.id, year: row.year, month: row.month } },
    });

    await prisma.monthlyActual.upsert({
      where: { accountId_year_month: { accountId: account.id, year: row.year, month: row.month } },
      create: { clientId, accountId: account.id, year: row.year, month: row.month, amount: row.amount },
      update: { amount: row.amount },
    });

    if (existing) {
      summary.updatedMonthlyActuals++;
    } else {
      summary.createdMonthlyActuals++;
    }
  }

  return summary;
}
