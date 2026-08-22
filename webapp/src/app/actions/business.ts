"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import prisma from "@/lib/prisma";
import { CURRENT_BUSINESS_COOKIE } from "@/lib/business-context";

export async function switchBusinessAction(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.user.id, businessId } },
  });
  if (!membership) {
    throw new Error("この事業者へのアクセス権がありません。");
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
