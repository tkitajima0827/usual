"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";
import { recomputeFiscalPeriod } from "@/lib/engine/recompute";

export interface OpeningBalanceActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function saveOpeningBalanceAction(
  _prev: OpeningBalanceActionState,
  formData: FormData,
): Promise<OpeningBalanceActionState> {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const spotQuantity = Number(formData.get("spotQuantity") ?? 0);
  const spotBookValue = Number(formData.get("spotBookValue") ?? 0);
  const marginLongQuantity = Number(formData.get("marginLongQuantity") ?? 0);
  const marginLongBookValue = Number(formData.get("marginLongBookValue") ?? 0);
  const marginShortQuantity = Number(formData.get("marginShortQuantity") ?? 0);
  const marginShortBookValue = Number(formData.get("marginShortBookValue") ?? 0);

  if (!fiscalPeriodId || !code || !name) {
    return { status: "error", message: "会計期間・銘柄コード・銘柄名は必須です。" };
  }

  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return { status: "error", message: "会計期間が見つかりません。" };
  }

  const security = await prisma.security.upsert({
    where: { businessId_code: { businessId: business.id, code } },
    update: { name },
    create: { businessId: business.id, code, name },
  });

  await prisma.openingBalance.upsert({
    where: { fiscalPeriodId_securityId: { fiscalPeriodId, securityId: security.id } },
    update: {
      spotQuantity,
      spotBookValue,
      marginLongQuantity,
      marginLongBookValue,
      marginShortQuantity,
      marginShortBookValue,
    },
    create: {
      businessId: business.id,
      fiscalPeriodId,
      securityId: security.id,
      spotQuantity,
      spotBookValue,
      marginLongQuantity,
      marginLongBookValue,
      marginShortQuantity,
      marginShortBookValue,
    },
  });

  await recomputeFiscalPeriod(business.id, fiscalPeriodId);

  revalidatePath("/opening-balance");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");

  return { status: "success", message: `${name}（${code}）の期首残高を保存しました。` };
}

export async function deleteOpeningBalanceAction(id: string) {
  const { business } = await requireCurrentBusiness();
  const ob = await prisma.openingBalance.findFirst({ where: { id, businessId: business.id } });
  if (!ob) return;
  await prisma.openingBalance.delete({ where: { id } });
  await recomputeFiscalPeriod(business.id, ob.fiscalPeriodId);
  revalidatePath("/opening-balance");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
}
