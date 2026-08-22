"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";
import { getSpotPositionAsOfMonth } from "@/lib/engine/spotPosition";
import { recomputeValuation } from "@/lib/engine/valuationEngine";

export interface ValuationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function saveMonthEndPricesAction(
  _prev: ValuationActionState,
  formData: FormData,
): Promise<ValuationActionState> {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!fiscalPeriodId || !month) {
    return { status: "error", message: "会計期間と対象月を指定してください。" };
  }

  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return { status: "error", message: "会計期間が見つかりません。" };
  }

  const positions = await getSpotPositionAsOfMonth(business.id, fiscalPeriodId, month);

  const priceUpdates: { securityId: string; unitPrice: number }[] = [];
  for (const pos of positions) {
    const raw = formData.get(`price_${pos.securityId}`);
    if (raw === null || raw === "") continue;
    const unitPrice = Number(raw);
    if (!Number.isFinite(unitPrice)) continue;
    priceUpdates.push({ securityId: pos.securityId, unitPrice });
  }

  if (priceUpdates.length === 0) {
    return { status: "error", message: "単価が1件も入力されていません。" };
  }

  for (const { securityId, unitPrice } of priceUpdates) {
    await prisma.monthEndPrice.upsert({
      where: { fiscalPeriodId_securityId_month: { fiscalPeriodId, securityId, month } },
      update: { unitPrice, source: "手入力" },
      create: { businessId: business.id, fiscalPeriodId, securityId, month, unitPrice, source: "手入力" },
    });
  }

  await recomputeValuation(business.id, fiscalPeriodId, month);

  revalidatePath("/valuation");
  revalidatePath("/dashboard");
  revalidatePath("/journal");

  return { status: "success", message: `${priceUpdates.length}銘柄の時価を保存し、評価損益を計算しました。` };
}
