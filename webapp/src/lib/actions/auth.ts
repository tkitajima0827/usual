"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  await createSession({ userId: user.id, role: user.role, clientId: user.clientId });
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
