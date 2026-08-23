"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";
import { readRowsFromFile } from "@/lib/import/readSheet";
import { parseTradeHistoryRows } from "@/lib/import/parseTradeHistory";
import { recomputeFiscalPeriod } from "@/lib/engine/recompute";
import { ImportKind } from "@/generated/prisma/enums";

export interface ImportActionState {
  status: "idle" | "success" | "error";
  message?: string;
  tradeCount?: number;
  warnings?: string[];
}

export async function importTradeHistoryAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const month = String(formData.get("month") ?? "");
  const file = formData.get("file");

  if (!fiscalPeriodId || !month) {
    return { status: "error", message: "会計期間と対象月を選択してください。" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "ファイルを選択してください。" };
  }

  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return { status: "error", message: "会計期間が見つかりません。" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: unknown[][];
  try {
    rows = await readRowsFromFile(file.name, buffer);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "読み込みに失敗しました。" };
  }

  const { trades, warnings } = parseTradeHistoryRows(rows);
  if (trades.length === 0) {
    return {
      status: "error",
      message: "取引データを読み取れませんでした。ファイル形式をご確認ください。",
      warnings: warnings.map((w) => w.message),
    };
  }

  const securityCache = new Map<string, string>();
  async function resolveSecurityId(code: string, name: string): Promise<string> {
    const cached = securityCache.get(code);
    if (cached) return cached;
    const security = await prisma.security.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name },
      create: { businessId: business.id, code, name },
    });
    securityCache.set(code, security.id);
    return security.id;
  }

  const batch = await prisma.importBatch.create({
    data: {
      businessId: business.id,
      fiscalPeriodId,
      kind: ImportKind.TRADE_HISTORY,
      fileName: file.name,
      month,
      rowCount: trades.length,
    },
  });

  for (const trade of trades) {
    const securityId = await resolveSecurityId(trade.securityCode, trade.securityName);
    await prisma.trade.create({
      data: {
        businessId: business.id,
        fiscalPeriodId,
        importBatchId: batch.id,
        securityId,
        tradeDate: trade.tradeDate,
        settlementDate: trade.settlementDate,
        market: trade.market,
        transactionType: trade.transactionType,
        termType: trade.termType,
        quantity: trade.quantity,
        unitPrice: trade.unitPrice,
        fee: trade.fee,
        tax: trade.tax,
        settlementAmount: trade.settlementAmount,
      },
    });
  }

  const summary = await recomputeFiscalPeriod(business.id, fiscalPeriodId);

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/journal");

  return {
    status: "success",
    message: `${trades.length}件の取引を取り込み、${summary.journalLineCount}件の仕訳を作成しました。`,
    tradeCount: trades.length,
    warnings: [...warnings.map((w) => w.message), ...summary.warnings],
  };
}

/**
 * 取込バッチを削除する。バッチに紐づく取引(Trade)も合わせて削除し、対象の会計期間を
 * 再計算する。ImportBatch側のonDelete:SetNullだけに任せると取引が残ってしまい
 * 原価・実現損益が誤って残ってしまうため、明示的にTradeも削除する。
 */
export async function deleteImportBatchAction(batchId: string) {
  const { business } = await requireCurrentBusiness();

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, businessId: business.id },
  });
  if (!batch) return;

  await prisma.$transaction([
    prisma.trade.deleteMany({ where: { importBatchId: batch.id } }),
    prisma.importBatch.delete({ where: { id: batch.id } }),
  ]);

  await recomputeFiscalPeriod(business.id, batch.fiscalPeriodId);

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/journal");
}
