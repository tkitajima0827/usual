"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { CalcMethod } from "@/generated/prisma/client";
import { accountBelongsToClient, fiscalYearBelongsToClient, requireClientAccess } from "@/lib/auth/dal";

export interface UpdatePlanEntryInput {
  clientId: string;
  fiscalYearId: string;
  accountId: string;
  calcMethod: CalcMethod;
  linkedAccountId?: string | null;
  linkedPercentage?: number | null;
  directValues?: { year: number; month: number; amount: number }[];
}

export interface UpdatePlanEntryResult {
  ok: boolean;
  error?: string;
}

/**
 * 単年度計画の1勘定科目分の計算方式・パラメータを更新する。
 * ページ側は getPlanViewModel() で毎回計算し直しているため、ここでは
 * PlanEntry / PlanDirectValue を書き換えて該当ページを再検証するだけでよい
 * （科目連動・過去平均などの再計算は次回描画時に自動的に反映される）。
 */
export async function updatePlanEntry(input: UpdatePlanEntryInput): Promise<UpdatePlanEntryResult> {
  const { clientId, fiscalYearId, accountId, calcMethod } = input;

  await requireClientAccess(clientId);
  if (!(await fiscalYearBelongsToClient(clientId, fiscalYearId)) || !(await accountBelongsToClient(clientId, accountId))) {
    return { ok: false, error: "不正なリクエストです" };
  }
  if (input.linkedAccountId && !(await accountBelongsToClient(clientId, input.linkedAccountId))) {
    return { ok: false, error: "不正なリクエストです" };
  }

  if (calcMethod === "LINKED") {
    if (!input.linkedAccountId) {
      return { ok: false, error: "科目連動には連動先科目の指定が必要です" };
    }
    if (input.linkedAccountId === accountId) {
      return { ok: false, error: "自分自身を連動先には指定できません" };
    }
    if (input.linkedPercentage == null || Number.isNaN(input.linkedPercentage)) {
      return { ok: false, error: "科目連動には割合(%)の指定が必要です" };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.planEntry.upsert({
        where: { fiscalYearId_accountId: { fiscalYearId, accountId } },
        create: {
          fiscalYearId,
          accountId,
          calcMethod,
          linkedAccountId: calcMethod === "LINKED" ? input.linkedAccountId : null,
          linkedPercentage: calcMethod === "LINKED" ? input.linkedPercentage : null,
        },
        update: {
          calcMethod,
          linkedAccountId: calcMethod === "LINKED" ? input.linkedAccountId : null,
          linkedPercentage: calcMethod === "LINKED" ? input.linkedPercentage : null,
        },
      });

      await tx.planDirectValue.deleteMany({ where: { planEntryId: entry.id } });
      if (calcMethod === "DIRECT" && input.directValues && input.directValues.length > 0) {
        await tx.planDirectValue.createMany({
          data: input.directValues.map((v) => ({
            planEntryId: entry.id,
            year: v.year,
            month: v.month,
            amount: v.amount,
          })),
        });
      }
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${clientId}/plans/${fiscalYearId}`);
  return { ok: true };
}
