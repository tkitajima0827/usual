"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";
import { getSpotPositionAsOfMonth } from "@/lib/engine/spotPosition";
import { recomputeValuation } from "@/lib/engine/valuationEngine";
import { fetchMonthEndClosingPrices } from "@/lib/market/fetchMonthEndPrices";
import { MissingApiKeyError } from "@/lib/ai/errors";

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

export interface FetchPricesActionState {
  status: "idle" | "success" | "error";
  message?: string;
  prices?: { securityId: string; unitPrice: number }[];
}

export async function fetchMonthEndPricesAction(
  _prev: FetchPricesActionState,
  formData: FormData,
): Promise<FetchPricesActionState> {
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
  if (positions.length === 0) {
    return { status: "error", message: "この月末時点で保有している現物銘柄がありません。" };
  }

  try {
    const results = await fetchMonthEndClosingPrices(
      month,
      positions.map((p) => ({ code: p.code, name: p.name })),
    );
    const priceByCode = new Map(results.map((r) => [r.code, r.unitPrice]));
    const prices = positions
      .map((p) => {
        const unitPrice = priceByCode.get(p.code);
        return unitPrice != null ? { securityId: p.securityId, unitPrice } : null;
      })
      .filter((row): row is { securityId: string; unitPrice: number } => row !== null);

    if (prices.length === 0) {
      return { status: "error", message: "株価を取得できませんでした。手入力してください。" };
    }
    const missing = positions.length - prices.length;
    return {
      status: "success",
      message:
        missing > 0
          ? `${prices.length}銘柄の月末終値を取得しました(${missing}銘柄は取得できなかったため未入力のままです)。内容を確認してから保存してください。`
          : `${prices.length}銘柄の月末終値を取得しました。内容を確認してから保存してください。`,
      prices,
    };
  } catch (error) {
    console.error(error);
    if (error instanceof MissingApiKeyError) {
      return {
        status: "error",
        message: "AI取得機能が設定されていません(管理者にANTHROPIC_API_KEYの設定を確認してください)。",
      };
    }
    return {
      status: "error",
      message: "取得に失敗しました。もう一度お試しいただくか、手入力してください。",
    };
  }
}
