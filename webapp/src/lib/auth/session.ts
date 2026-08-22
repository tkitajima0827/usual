import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// 意図的に `server-only` は使わない: このモジュールは prisma/seed.ts のような
// 素のNode.jsスクリプトからも読み込む想定のため（`server-only` はNode実行時に
// エラーを投げてしまう）。呼び出し側（Client Componentから読み込まない）で規律を守る。

const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7日

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET が設定されていません（本番環境では必須です）");
    }
    // 開発環境のみ: .envにSESSION_SECRET未設定でも起動できるようフォールバックする
    // （本番では必ず openssl rand -base64 32 等で生成した値を設定すること）。
    console.warn(
      "[auth] SESSION_SECRET が未設定のため開発用の固定値を使用します。本番環境では必ず環境変数を設定してください。",
    );
    return new TextEncoder().encode("dev-only-insecure-session-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  role: string;
  clientId: string | null;
  [key: string]: unknown;
}

async function encrypt(payload: SessionPayload, expiresAt: Date): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

async function decrypt(session: string | undefined): Promise<SessionPayload | null> {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, getSecretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await encrypt(payload, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
