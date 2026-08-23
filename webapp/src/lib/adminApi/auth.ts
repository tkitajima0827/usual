import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * 管理用API（/api/admin/*）の認可チェック。
 * ブラウザセッション（Cookie）ではなく、環境変数 ADMIN_API_TOKEN と一致する
 * Bearerトークンを要求する（Claudeなど外部からのデータ投入作業専用）。
 * トークン未設定の場合は常に拒否する（fail closed）。
 */
export function requireAdminToken(request: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_API_TOKEN が設定されていません" }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const isValid =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }
  return null;
}
