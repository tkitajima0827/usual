/**
 * 蛤覚合同会社 26.02月期のリファレンスデータ投入スクリプト。
 *
 * 実データの制約:
 * - 2026年2月分の元データ(約定履歴)は全42件を実データそのまま登録する。
 * - 期首残高(2025/3/1時点)そのものは未取得のため、実際に確認できた
 *   「2026年1月末時点の現物保有」(有価証券評価損益計算シートの前月分貼付表)を
 *   2月分インポートの直前残高として登録する。したがって本スクリプトが再現するのは
 *   正式な期首残高ではなく、2026年2月の実績を正しく検証できる直近残高である。
 * - 寿スピリッツ・ｉＦｒｅｅＥＴＦ日経平均インバースは2月2日に現引で決済されているが、
 *   対応する信用新規買は1月以前のため2月データに含まれない。現引は必ず建値と同一の
 *   単価で決済される(現引・現渡は付け替えであり損益を生まない)ため、
 *   現引の約定単価がそのまま元の建値であることが確定しており、その値から
 *   信用買建の期首残高を正確に逆算できる。
 * - 宮地エンジニアリンググループは2月17日に信用返済売で決済されているが、
 *   対応する信用新規買は1月以前のため2月データに含まれない。信用返済売(現引と異なり)は
 *   建値と決済単価が一致する保証がないため正確な原価は不明だが、
 *   同日に同銘柄を@1870で信用新規買（同枚数のロールオーバー）していることから、
 *   その単価を建値の近似値として採用する（実現損益は参考値）。
 * - 月末単価は「有価証券評価損益計算」シートに記載の2026/2/27時点の実際の単価。
 */
import fs from "fs";
import path from "path";
import prisma from "../src/lib/prisma";
import { readRowsFromFile } from "../src/lib/import/readSheet";
import { parseTradeHistoryRows } from "../src/lib/import/parseTradeHistory";
import { recomputeFiscalPeriod } from "../src/lib/engine/recompute";
import { recomputeValuation } from "../src/lib/engine/valuationEngine";
import { ImportKind } from "../src/generated/prisma/enums";

const BUSINESS_CODE = "hamaguri";
const FISCAL_PERIOD_LABEL = "26.02月期";
const IMPORT_MONTH = "2026-02";

// 2026年1月末時点の現物保有(有価証券評価損益計算シート「前月分貼り付け」より)
const JAN_END_SPOT_HOLDINGS: { code: string; name: string; quantity: number; bookValue: number }[] = [
  { code: "9432", name: "日本電信電話", quantity: 25000, bookValue: 3006300 },
  { code: "9433", name: "ＫＤＤＩ", quantity: 2000, bookValue: 3459793 },
  { code: "8410", name: "セブン銀行", quantity: 4000, bookValue: 1081140 },
  { code: "9434", name: "ソフトバンク", quantity: 1000, bookValue: 144100 },
  { code: "9201", name: "日本航空", quantity: 200, bookValue: 581770 },
  { code: "2503", name: "キリンホールディングス", quantity: 100, bookValue: 190917 },
  { code: "4912", name: "ライオン", quantity: 100, bookValue: 125000 },
  { code: "9005", name: "東急", quantity: 1500, bookValue: 2629913 },
  { code: "3003", name: "ヒューリック", quantity: 300, bookValue: 269798 },
  { code: "1384", name: "ホクリヨウ", quantity: 100, bookValue: 140000 },
  { code: "8697", name: "日本取引所グループ", quantity: 400, bookValue: 399289 },
  { code: "2222", name: "寿スピリッツ", quantity: 100, bookValue: 182393 },
  { code: "4751", name: "サイバーエージェント", quantity: 100, bookValue: 76750 },
  { code: "5351", name: "品川リフラクトリーズ", quantity: 500, bookValue: 774909 },
  { code: "7970", name: "信越ポリマー", quantity: 100, bookValue: 136289 },
  { code: "3382", name: "セブン＆アイ・ホールディングス", quantity: 400, bookValue: 716901 },
  { code: "2938", name: "オカムラ食品工業", quantity: 300, bookValue: 208015 },
  { code: "1456", name: "ｉＦｒｅｅＥＴＦ　日経平均インバース・インデックス", quantity: 400, bookValue: 707351 },
  { code: "6966", name: "三井ハイテック", quantity: 1600, bookValue: 1238112 },
  { code: "8035", name: "東京エレクトロン", quantity: 100, bookValue: 2129998 },
  { code: "4595", name: "ミズホメディー", quantity: 400, bookValue: 566709 },
  { code: "3431", name: "宮地エンジニアリンググループ", quantity: 400, bookValue: 603031 },
];

// 2月中に決済されたが建玉が1月以前の信用ポジション。
// 寿スピリッツ・iFreeETFは現引の約定単価(=建値そのもの、損益ゼロ確定)から正確に算出。
// 宮地エンジニアリンググループは同日ロールオーバーの新規買単価(@1870)を近似値として使用。
const JAN_END_MARGIN_LONG_HOLDINGS: { code: string; name: string; quantity: number; bookValue: number }[] = [
  { code: "2222", name: "寿スピリッツ", quantity: 100, bookValue: 100 * 1785 },
  {
    code: "1456",
    name: "ｉＦｒｅｅＥＴＦ　日経平均インバース・インデックス",
    quantity: 100,
    bookValue: 100 * 1645,
  },
  { code: "3431", name: "宮地エンジニアリンググループ", quantity: 500, bookValue: 500 * 1870 },
];

// 有価証券評価損益計算シート記載の2026/2/27時点の実際の単価(円)
const FEB_END_PRICES: { code: string; unitPrice: number }[] = [
  { code: "9432", unitPrice: 153.3 },
  { code: "9433", unitPrice: 2671.0 },
  { code: "8410", unitPrice: 300.9 },
  { code: "9434", unitPrice: 213.8 },
  { code: "9201", unitPrice: 3228.0 },
  { code: "2503", unitPrice: 2707.0 },
  { code: "4912", unitPrice: 1838.5 },
  { code: "9005", unitPrice: 1997.5 },
  { code: "3003", unitPrice: 2069.0 },
  { code: "5108", unitPrice: 3796.0 },
  { code: "1384", unitPrice: 3210.0 },
  { code: "8697", unitPrice: 2135.5 },
  { code: "2222", unitPrice: 1987.5 },
  { code: "4751", unitPrice: 1378.0 },
  { code: "5351", unitPrice: 2503.0 },
  { code: "7970", unitPrice: 2235.0 },
  { code: "3382", unitPrice: 2195.5 },
  { code: "2938", unitPrice: 1220.0 },
  { code: "1456", unitPrice: 1503.0 },
  { code: "6966", unitPrice: 877.0 },
  { code: "8035", unitPrice: 44010.0 },
  { code: "409A", unitPrice: 1344.0 },
  { code: "7733", unitPrice: 1528.0 },
  { code: "6501", unitPrice: 5226.0 },
  { code: "4595", unitPrice: 1926.0 },
  { code: "3431", unitPrice: 1942.0 },
];

async function main() {
  const business = await prisma.business.findUnique({ where: { code: BUSINESS_CODE } });
  if (!business) {
    throw new Error(
      `事業者 "${BUSINESS_CODE}" が見つかりません。先に \`npm run db:seed\` を実行してください。`,
    );
  }

  const fiscalPeriod = await prisma.fiscalPeriod.findUnique({
    where: { businessId_label: { businessId: business.id, label: FISCAL_PERIOD_LABEL } },
  });
  if (!fiscalPeriod) {
    throw new Error(`会計期間 "${FISCAL_PERIOD_LABEL}" が見つかりません。`);
  }

  const businessId = business.id;
  const securityIdByCode = new Map<string, string>();
  async function resolveSecurity(code: string, name: string): Promise<string> {
    const cached = securityIdByCode.get(code);
    if (cached) return cached;
    const security = await prisma.security.upsert({
      where: { businessId_code: { businessId, code } },
      update: { name },
      create: { businessId, code, name },
    });
    securityIdByCode.set(code, security.id);
    return security.id;
  }

  console.log("1月末時点の現物保有を登録中...");
  for (const holding of JAN_END_SPOT_HOLDINGS) {
    const securityId = await resolveSecurity(holding.code, holding.name);
    await prisma.openingBalance.upsert({
      where: { fiscalPeriodId_securityId: { fiscalPeriodId: fiscalPeriod.id, securityId } },
      update: {
        spotQuantity: holding.quantity,
        spotBookValue: holding.bookValue,
      },
      create: {
        businessId: business.id,
        fiscalPeriodId: fiscalPeriod.id,
        securityId,
        spotQuantity: holding.quantity,
        spotBookValue: holding.bookValue,
      },
    });
  }

  console.log("2月中に決済された1月以前建ての信用買建を登録中...");
  for (const holding of JAN_END_MARGIN_LONG_HOLDINGS) {
    const securityId = await resolveSecurity(holding.code, holding.name);
    await prisma.openingBalance.upsert({
      where: { fiscalPeriodId_securityId: { fiscalPeriodId: fiscalPeriod.id, securityId } },
      update: {
        marginLongQuantity: holding.quantity,
        marginLongBookValue: holding.bookValue,
      },
      create: {
        businessId: business.id,
        fiscalPeriodId: fiscalPeriod.id,
        securityId,
        marginLongQuantity: holding.quantity,
        marginLongBookValue: holding.bookValue,
      },
    });
  }

  console.log("2026年2月 元データ(約定履歴 全42件)を取り込み中...");
  const csvPath = path.resolve(__dirname, "../samples/hamaguri_motodata_202602_full.csv");
  const buffer = fs.readFileSync(csvPath);
  const rows = await readRowsFromFile(csvPath, buffer);
  const { trades, warnings } = parseTradeHistoryRows(rows);
  if (warnings.length > 0) {
    console.warn("パース警告:", warnings);
  }

  // 冪等に再実行できるよう、このスクリプト由来の既存取込バッチを削除してから再登録する。
  const existingBatches = await prisma.importBatch.findMany({
    where: { businessId: business.id, fiscalPeriodId: fiscalPeriod.id, month: IMPORT_MONTH },
  });
  if (existingBatches.length > 0) {
    await prisma.trade.deleteMany({
      where: { importBatchId: { in: existingBatches.map((b) => b.id) } },
    });
    await prisma.importBatch.deleteMany({ where: { id: { in: existingBatches.map((b) => b.id) } } });
  }

  const batch = await prisma.importBatch.create({
    data: {
      businessId: business.id,
      fiscalPeriodId: fiscalPeriod.id,
      kind: ImportKind.TRADE_HISTORY,
      fileName: "hamaguri_motodata_202602_full.csv",
      month: IMPORT_MONTH,
      rowCount: trades.length,
    },
  });

  for (const trade of trades) {
    const securityId = await resolveSecurity(trade.securityCode, trade.securityName);
    await prisma.trade.create({
      data: {
        businessId: business.id,
        fiscalPeriodId: fiscalPeriod.id,
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

  console.log(`${trades.length}件の取引を登録しました。原価・実現損益・仕訳を再計算中...`);
  const summary = await recomputeFiscalPeriod(business.id, fiscalPeriod.id);
  if (summary.warnings.length > 0) {
    console.warn("原価計算の警告(期首データ未取得の信用建玉など):");
    for (const w of summary.warnings) console.warn(" -", w);
  }

  console.log("2026年2月末の実際の単価を登録中...");
  for (const price of FEB_END_PRICES) {
    const securityId = securityIdByCode.get(price.code);
    if (!securityId) continue;
    await prisma.monthEndPrice.upsert({
      where: {
        fiscalPeriodId_securityId_month: {
          fiscalPeriodId: fiscalPeriod.id,
          securityId,
          month: IMPORT_MONTH,
        },
      },
      update: { unitPrice: price.unitPrice, source: "有価証券評価損益計算シート(実データ)" },
      create: {
        businessId: business.id,
        fiscalPeriodId: fiscalPeriod.id,
        securityId,
        month: IMPORT_MONTH,
        unitPrice: price.unitPrice,
        source: "有価証券評価損益計算シート(実データ)",
      },
    });
  }

  console.log("月末時価評価を計算中...");
  const valuationSummary = await recomputeValuation(business.id, fiscalPeriod.id, IMPORT_MONTH);

  console.log("done.");
  console.log(`取引: ${summary.tradeCount}件 / 仕訳: ${summary.journalLineCount}件`);
  console.log(
    `評価: ${valuationSummary.valuationCount}銘柄 / 評価損益仕訳: ${valuationSummary.journalCount}件`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
