import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import type { UserRole } from "@/generated/prisma/client";

export interface AuthSession {
  userId: string;
  role: UserRole;
  clientId: string | null;
}

const FIRM_ROLES = new Set<UserRole>(["FIRM_ADMIN", "FIRM_STAFF"]);

/** セッションを検証する。未ログインならログイン画面へリダイレクトする（React cacheで1リクエスト内は再利用） */
export const verifySession = cache(async (): Promise<AuthSession> => {
  const payload = await readSession();
  if (!payload) redirect("/login");
  return {
    userId: payload.userId,
    role: payload.role as UserRole,
    clientId: (payload.clientId as string | null) ?? null,
  };
});

/** ログイン中ユーザーのDBレコード（名前・メール表示用）を取得する */
export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");
  return user;
});

export function isFirmRole(role: UserRole): boolean {
  return FIRM_ROLES.has(role);
}

/**
 * 指定したclientIdのデータにアクセスできるかを確認する。
 * 事務所側ロール（FIRM_ADMIN/FIRM_STAFF）は全顧客にアクセス可能。
 * 顧客側ロール（CLIENT_ADMIN/CLIENT_USER）は自分のclientIdのみアクセス可能で、
 * それ以外は404（他クライアントのIDの存在を推測されないようにする）。
 */
export async function requireClientAccess(clientId: string): Promise<AuthSession> {
  const session = await verifySession();
  if (isFirmRole(session.role)) return session;
  if (session.clientId === clientId) return session;
  notFound();
}

// Server Actionは入力値（fiscalYearId/accountId等）をクライアントから受け取るため、
// requireClientAccess()でclientIdへのアクセス権を確認するだけでは不十分
// （別クライアントのfiscalYearId/accountIdを渡されると越境更新できてしまう）。
// 以下は、そのIDが本当に指定clientIdに属するかを確認するための補助関数。

export async function fiscalYearBelongsToClient(clientId: string, fiscalYearId: string): Promise<boolean> {
  const fiscalYear = await prisma.fiscalYear.findUnique({
    where: { id: fiscalYearId },
    select: { clientId: true },
  });
  return fiscalYear?.clientId === clientId;
}

export async function accountBelongsToClient(clientId: string, accountId: string): Promise<boolean> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { clientId: true } });
  return account?.clientId === clientId;
}

export async function counterpartyBelongsToClient(clientId: string, counterpartyId: string): Promise<boolean> {
  const counterparty = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { clientId: true },
  });
  return counterparty?.clientId === clientId;
}
