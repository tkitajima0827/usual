import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";

// 未ログイン時にアクセスできる唯一のパス。それ以外は全てログイン必須にする。
const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// 未ログインユーザーを/loginへリダイレクトする楽観的チェック（Cookieの検証のみ、DBは見ない）。
// より厳密な認可（顧客ごとのスコープ制御など）はsrc/lib/auth/dal.tsのrequireClientAccess()で行う。
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/* はブラウザセッション（Cookie）ではなくBearerトークンで各Route Handlerが
  // 個別に認可するため、ここでのCookieチェック（/loginへのリダイレクト）は対象外にする。
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const session = await readSession();

  if (!isPublicPath(pathname) && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isPublicPath(pathname) && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
