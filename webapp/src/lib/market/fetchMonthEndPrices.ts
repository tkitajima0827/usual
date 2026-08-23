import Anthropic from "@anthropic-ai/sdk";
import { MissingApiKeyError } from "@/lib/ai/errors";

export interface MonthEndPriceLookup {
  code: string;
  unitPrice: number;
}

const PRICE_TOOL = {
  name: "report_prices",
  description:
    "JPX(日本取引所グループ)月間相場表PDFで確認できた銘柄ごとの月末終値を報告する。PDFで確認できた銘柄のみ含めること。",
  input_schema: {
    type: "object" as const,
    properties: {
      prices: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            code: { type: "string" as const, description: "銘柄コード(入力された銘柄コードと同一の文字列)" },
            unitPrice: {
              type: "number" as const,
              description: "月間相場表PDFの「終値」欄に記載されている、指定した月の最終営業日時点の終値(円)。",
            },
          },
          required: ["code", "unitPrice"],
        },
      },
    },
    required: ["prices"],
  },
};

/**
 * 指定した月の最終営業日時点の終値を、JPX(日本取引所グループ)が公表している
 * 「月間相場表」PDFから読み取る。Claudeのweb_search/web_fetch機能でPDFを開き、
 * 銘柄コードごとの「終値」欄の値をそのまま使う(Yahoo!ファイナンス等の他サイトは使わない)。
 * 現物(売買目的有価証券)の月末時価評価に使うためのもので、信用建玉は対象外。
 * 取得結果は必ず画面上でユーザーに確認・修正させてから保存すること。
 */
export async function fetchMonthEndClosingPrices(
  month: string,
  securities: { code: string; name: string }[],
): Promise<MonthEndPriceLookup[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic({ apiKey });
  const [year, m] = month.split("-").map(Number);
  const monthLabel = `${year}年${m}月`;
  const list = securities.map((s) => `- ${s.code} ${s.name}`).join("\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [
      PRICE_TOOL,
      { type: "web_search_20260209", name: "web_search", max_uses: 20 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 20 },
    ],
    messages: [
      {
        role: "user",
        content:
          `以下は日本の上場銘柄の一覧です。それぞれについて、${monthLabel}の最終営業日時点の終値(円)を調べてください。\n\n` +
          `${list}\n\n` +
          "値は必ず日本取引所グループ(JPX)が公表している「月間相場表」のPDFから取得してください" +
          "(他のサイトや記憶からの推測は使わないでください)。手順の目安:\n" +
          "1. web_searchで「JPX 月間相場表」や「JPX statistics-equities price archives」などを検索し、" +
          "統計情報（株式関連）の月間相場表アーカイブページ(jpx.co.jpのstatistics-equities/price配下)を見つける\n" +
          `2. ${year}年${m}月分のPDFへのリンクを探す。ファイルは銘柄コードの範囲ごとに複数(-1, -2, -3など)に` +
          "分割されていることがあるので、対象銘柄が含まれるファイルを特定する\n" +
          "3. web_fetchでそのPDFを開き、各銘柄コードの行にある「終値」欄(日付とセットになっている、" +
          "月間の最終取引日の終値)の数値を読み取る\n\n" +
          "調査が終わったら、最後に必ずreport_pricesツールを1回だけ呼び出し、PDFで確認できた銘柄だけをまとめて報告してください。" +
          "PDFで確認できなかった銘柄は結果に含めないでください(推測で埋めないでください)。",
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) return [];

  const input = toolUse.input as { prices?: MonthEndPriceLookup[] };
  return (input.prices ?? []).filter((p) => p.code && Number.isFinite(p.unitPrice));
}
