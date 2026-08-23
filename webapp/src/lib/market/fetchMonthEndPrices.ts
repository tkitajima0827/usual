import Anthropic from "@anthropic-ai/sdk";
import { MissingApiKeyError } from "@/lib/ai/errors";

export interface MonthEndPriceLookup {
  code: string;
  unitPrice: number;
}

const PRICE_TOOL = {
  name: "report_prices",
  description: "調査した銘柄ごとの月末終値を報告する。確信を持って特定できた銘柄のみ含めること。",
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
              description: "指定した月の最終営業日時点の終値(円)。",
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
 * 指定した月の最終営業日時点の終値を、Claudeのweb_search機能で銘柄ごとに調べる。
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
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [PRICE_TOOL, { type: "web_search_20260209", name: "web_search", max_uses: 60 }],
    messages: [
      {
        role: "user",
        content:
          `以下は日本の上場銘柄の一覧です。それぞれについて、${monthLabel}の最終営業日時点の終値(円)をweb_searchで調べてください。` +
          "Yahoo!ファイナンス(finance.yahoo.co.jp)など信頼できる情報源を使ってください。" +
          "最終営業日が土日祝で休場の場合は、その月最後の取引日の終値を使ってください。\n\n" +
          `${list}\n\n` +
          "調査が終わったら、最後に必ずreport_pricesツールを1回だけ呼び出し、確信を持って値を特定できた銘柄だけをまとめて報告してください。" +
          "特定できなかった銘柄は結果に含めないでください(推測で埋めないでください)。",
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
