import Anthropic from "@anthropic-ai/sdk";

export class MissingApiKeyError extends Error {}

export interface ParsedHoldingRow {
  code: string;
  name: string;
  spotQuantity: number;
  spotBookValue: number;
  marginLongQuantity: number;
  marginLongBookValue: number;
  marginShortQuantity: number;
  marginShortBookValue: number;
}

const EXTRACT_TOOL = {
  name: "report_holdings",
  description:
    "残高証明書に記載されている銘柄ごとの保有状況を報告する。現物・信用買建・信用売建は別々の欄に分けて記載すること。記載がない区分は0を入れること。",
  input_schema: {
    type: "object" as const,
    properties: {
      holdings: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            code: {
              type: "string" as const,
              description: "銘柄コード(4桁の証券コード等)。記載がなければ空文字。",
            },
            name: { type: "string" as const, description: "銘柄名" },
            spotQuantity: { type: "number" as const, description: "現物株数" },
            spotBookValue: { type: "number" as const, description: "現物の取得価額(円、カンマ抜き)" },
            marginLongQuantity: { type: "number" as const, description: "信用買建の株数" },
            marginLongBookValue: {
              type: "number" as const,
              description: "信用買建の取得価額(円、カンマ抜き)",
            },
            marginShortQuantity: { type: "number" as const, description: "信用売建の株数" },
            marginShortBookValue: {
              type: "number" as const,
              description: "信用売建の売付代金(円、カンマ抜き)",
            },
          },
          required: [
            "code",
            "name",
            "spotQuantity",
            "spotBookValue",
            "marginLongQuantity",
            "marginLongBookValue",
            "marginShortQuantity",
            "marginShortBookValue",
          ],
        },
      },
    },
    required: ["holdings"],
  },
};

function guessMediaType(mimeType: string): "application/pdf" | "image/png" | "image/jpeg" | "image/webp" {
  if (mimeType === "application/pdf") return "application/pdf";
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * 証券会社発行の残高証明書(PDF/画像)をClaudeの画像・文書認識機能で読み取り、
 * 銘柄ごとの現物・信用買建・信用売建の株数と取得価額を抽出する。
 * 読み取り結果は必ず画面上でユーザーに確認・修正させてから保存すること。
 */
export async function parseBalanceCertificate(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ParsedHoldingRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic({ apiKey });
  const mediaType = guessMediaType(mimeType);
  const base64 = fileBuffer.toString("base64");

  const contentBlock =
    mediaType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: mediaType, data: base64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        } as const);

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "report_holdings" },
    messages: [
      {
        role: "user",
        content: [
          contentBlock,
          {
            type: "text",
            text:
              "これは証券会社が発行した残高証明書です。記載されている銘柄ごとに、現物・信用買建・信用売建の株数と取得価額(円)をreport_holdingsツールで報告してください。金額はカンマを除いた数値にし、該当する保有がない区分は0にしてください。",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) return [];

  const input = toolUse.input as { holdings?: ParsedHoldingRow[] };
  return (input.holdings ?? []).filter((h) => h.name?.trim());
}
