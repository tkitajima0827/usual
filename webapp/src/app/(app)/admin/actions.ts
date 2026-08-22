"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";

async function requireAdmin() {
  const ctx = await requireCurrentBusiness();
  if (ctx.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return ctx;
}

export async function createBusinessAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!name || !code) throw new Error("事業者名・コードは必須です。");

  const { user } = await requireCurrentBusiness();
  const business = await prisma.business.create({ data: { name, code } });
  await prisma.membership.create({
    data: { userId: user.id, businessId: business.id, role: "ADMIN" },
  });
  revalidatePath("/admin");
}

export async function createFiscalPeriodAction(formData: FormData) {
  const { business } = await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!label || !startDate || !endDate) throw new Error("会計期間の項目は必須です。");

  await prisma.fiscalPeriod.create({
    data: {
      businessId: business.id,
      label,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
  revalidatePath("/admin");
}

export async function createUserAction(formData: FormData) {
  const { business } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "MEMBER";

  if (!email || !name || password.length < 8) {
    throw new Error("メールアドレス・氏名・8文字以上のパスワードは必須です。");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash },
  });

  await prisma.membership.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    update: { role },
    create: { userId: user.id, businessId: business.id, role },
  });

  revalidatePath("/admin");
}

export async function addMembershipAction(formData: FormData) {
  const { business } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "MEMBER";
  if (!userId) throw new Error("ユーザーを選択してください。");

  await prisma.membership.upsert({
    where: { userId_businessId: { userId, businessId: business.id } },
    update: { role },
    create: { userId, businessId: business.id, role },
  });
  revalidatePath("/admin");
}

export async function removeMembershipAction(membershipId: string) {
  const { business } = await requireAdmin();
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, businessId: business.id },
  });
  if (!membership) return;
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/admin");
}
