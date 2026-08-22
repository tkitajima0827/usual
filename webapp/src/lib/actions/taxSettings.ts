"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { ConsumptionTaxCategory } from "@/generated/prisma/client";
import { accountBelongsToClient, fiscalYearBelongsToClient, requireClientAccess } from "@/lib/auth/dal";

export interface UpdateTaxSettingsInput {
  clientId: string;
  fiscalYearId: string;
  effectiveTaxRatePercent: number;
  lossCarryforward: number;
  consumptionTaxRatePercent: number;
  priorYearCorporateTaxAnnual: number | null;
  priorYearConsumptionTaxAnnual: number | null;
}

export interface UpdateTaxSettingsResult {
  ok: boolean;
  error?: string;
}

/**
 * 消費税・法人税の概算計算に使う会計年度単位の設定（bixidの「申告データ登録」相当）を更新する。
 * ページ側は getPlanViewModel() で毎回再計算しているため、ここでは TaxSettings を
 * upsert して該当ページを再検証するだけでよい。
 */
export async function updateTaxSettings(input: UpdateTaxSettingsInput): Promise<UpdateTaxSettingsResult> {
  const { clientId, fiscalYearId } = input;

  await requireClientAccess(clientId);
  if (!(await fiscalYearBelongsToClient(clientId, fiscalYearId))) {
    return { ok: false, error: "不正なリクエストです" };
  }

  if (input.effectiveTaxRatePercent < 0 || input.effectiveTaxRatePercent > 100) {
    return { ok: false, error: "実効税率は0〜100の範囲で入力してください" };
  }
  if (input.consumptionTaxRatePercent < 0 || input.consumptionTaxRatePercent > 100) {
    return { ok: false, error: "消費税率は0〜100の範囲で入力してください" };
  }
  if (input.lossCarryforward < 0) {
    return { ok: false, error: "繰越欠損金は0以上で入力してください" };
  }

  try {
    await prisma.taxSettings.upsert({
      where: { fiscalYearId },
      create: {
        fiscalYearId,
        effectiveTaxRate: input.effectiveTaxRatePercent,
        lossCarryforward: input.lossCarryforward,
        consumptionTaxRate: input.consumptionTaxRatePercent,
        priorYearCorporateTaxAnnual: input.priorYearCorporateTaxAnnual,
        priorYearConsumptionTaxAnnual: input.priorYearConsumptionTaxAnnual,
      },
      update: {
        effectiveTaxRate: input.effectiveTaxRatePercent,
        lossCarryforward: input.lossCarryforward,
        consumptionTaxRate: input.consumptionTaxRatePercent,
        priorYearCorporateTaxAnnual: input.priorYearCorporateTaxAnnual,
        priorYearConsumptionTaxAnnual: input.priorYearConsumptionTaxAnnual,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${clientId}/plans/${fiscalYearId}`);
  return { ok: true };
}

export interface UpdateConsumptionTaxCategoryInput {
  clientId: string;
  fiscalYearId: string;
  accountId: string;
  consumptionTaxCategory: ConsumptionTaxCategory;
}

/** 勘定科目の消費税課税区分（課税/非課税/対象外）を手動で上書きする */
export async function updateConsumptionTaxCategory(
  input: UpdateConsumptionTaxCategoryInput,
): Promise<UpdateTaxSettingsResult> {
  await requireClientAccess(input.clientId);
  if (!(await accountBelongsToClient(input.clientId, input.accountId))) {
    return { ok: false, error: "不正なリクエストです" };
  }

  try {
    await prisma.account.update({
      where: { id: input.accountId },
      data: { consumptionTaxCategory: input.consumptionTaxCategory },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${input.clientId}/plans/${input.fiscalYearId}`);
  return { ok: true };
}
