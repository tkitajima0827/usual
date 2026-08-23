import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminToken } from "@/lib/adminApi/auth";
import { hashPassword } from "@/lib/auth/password";
import type { UserRole } from "@/generated/prisma/client";

const VALID_ROLES = ["FIRM_ADMIN", "FIRM_STAFF", "CLIENT_ADMIN", "CLIENT_USER"] as const;

export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const email: string | undefined = body?.email;
  const name: string | undefined = body?.name;
  const role: string | undefined = body?.role;
  const password: string | undefined = body?.password;
  const clientId: string | null | undefined = body?.clientId ?? null;

  if (!email || !name || !role || !password) {
    return NextResponse.json({ error: "email, name, role, password は必須です" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return NextResponse.json({ error: `role は ${VALID_ROLES.join(" / ")} のいずれか` }, { status: 400 });
  }
  const isClientRole = role === "CLIENT_ADMIN" || role === "CLIENT_USER";
  if (isClientRole && !clientId) {
    return NextResponse.json({ error: "CLIENT_ADMIN / CLIENT_USER には clientId が必要です" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上にしてください" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: `既に存在するメールアドレスです: ${email}` }, { status: 409 });
  }

  if (isClientRole) {
    const client = await prisma.client.findUnique({ where: { id: clientId! } });
    if (!client) {
      return NextResponse.json({ error: `clientId が見つかりません: ${clientId}` }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: role as UserRole,
      passwordHash,
      clientId: isClientRole ? clientId : null,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
