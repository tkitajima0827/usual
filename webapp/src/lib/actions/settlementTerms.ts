"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { SettlementDirection } from "@/generated/prisma/client";
import {
  accountBelongsToClient,
  counterpartyBelongsToClient,
  fiscalYearBelongsToClient,
  requireClientAccess,
} from "@/lib/auth/dal";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function validateTerm(closingDay: number, monthsAfter: number, settlementDay: number): string | null {
  if (closingDay < 1 || closingDay > 31) return "締め日は1〜31の範囲で入力してください";
  if (settlementDay < 1 || settlementDay > 31) return "回収/支払日は1〜31の範囲で入力してください";
  if (monthsAfter < 0 || monthsAfter > 12) return "何ヶ月後は0〜12の範囲で入力してください";
  return null;
}

export interface UpdateDefaultSettlementTermInput {
  clientId: string;
  direction: SettlementDirection;
  closingDay: number;
  monthsAfter: number;
  settlementDay: number;
}

/** 事業者ごとの既定の回収・支払サイト（例:「末締め翌月末」）を更新する */
export async function updateDefaultSettlementTerm(input: UpdateDefaultSettlementTermInput): Promise<ActionResult> {
  await requireClientAccess(input.clientId);
  const error = validateTerm(input.closingDay, input.monthsAfter, input.settlementDay);
  if (error) return { ok: false, error };

  try {
    await prisma.defaultSettlementTerm.upsert({
      where: { clientId_direction: { clientId: input.clientId, direction: input.direction } },
      create: {
        clientId: input.clientId,
        direction: input.direction,
        closingDay: input.closingDay,
        monthsAfter: input.monthsAfter,
        settlementDay: input.settlementDay,
      },
      update: {
        closingDay: input.closingDay,
        monthsAfter: input.monthsAfter,
        settlementDay: input.settlementDay,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath(`/clients/${input.clientId}/plans`, "layout");
  return { ok: true };
}

export interface UpdateAccountSettlementTermInput {
  clientId: string;
  fiscalYearId: string;
  accountId: string;
  /** nullを渡すと個別設定を解除し、事業者共通の既定サイトに戻す */
  term: { closingDay: number; monthsAfter: number; settlementDay: number } | null;
}

/** 勘定科目ごとの回収・支払サイトの個別設定（事業者既定サイトへの上書き）を更新する */
export async function updateAccountSettlementTerm(input: UpdateAccountSettlementTermInput): Promise<ActionResult> {
  await requireClientAccess(input.clientId);
  if (
    !(await fiscalYearBelongsToClient(input.clientId, input.fiscalYearId)) ||
    !(await accountBelongsToClient(input.clientId, input.accountId))
  ) {
    return { ok: false, error: "不正なリクエストです" };
  }
  if (input.term) {
    const error = validateTerm(input.term.closingDay, input.term.monthsAfter, input.term.settlementDay);
    if (error) return { ok: false, error };
  }

  try {
    await prisma.account.update({
      where: { id: input.accountId },
      data: {
        settlementClosingDay: input.term?.closingDay ?? null,
        settlementMonthsAfter: input.term?.monthsAfter ?? null,
        settlementDay: input.term?.settlementDay ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${input.clientId}/plans/${input.fiscalYearId}`);
  return { ok: true };
}

export interface CounterpartyInput {
  clientId: string;
  name: string;
  direction: SettlementDirection;
  accountId: string | null;
  closingDay: number;
  monthsAfter: number;
  settlementDay: number;
}

/** 標準の回収・支払サイトに当てはまらない相手先の個別サイトを登録する */
export async function createCounterparty(input: CounterpartyInput): Promise<ActionResult> {
  await requireClientAccess(input.clientId);
  if (input.accountId && !(await accountBelongsToClient(input.clientId, input.accountId))) {
    return { ok: false, error: "不正なリクエストです" };
  }
  if (!input.name.trim()) return { ok: false, error: "相手先名を入力してください" };
  const error = validateTerm(input.closingDay, input.monthsAfter, input.settlementDay);
  if (error) return { ok: false, error };

  try {
    await prisma.counterparty.create({
      data: {
        clientId: input.clientId,
        name: input.name.trim(),
        direction: input.direction,
        accountId: input.accountId,
        closingDay: input.closingDay,
        monthsAfter: input.monthsAfter,
        settlementDay: input.settlementDay,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "同じ相手先が既に登録されている可能性があります" };
  }

  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}

export interface UpdateCounterpartyInput extends CounterpartyInput {
  id: string;
}

export async function updateCounterparty(input: UpdateCounterpartyInput): Promise<ActionResult> {
  await requireClientAccess(input.clientId);
  if (
    !(await counterpartyBelongsToClient(input.clientId, input.id)) ||
    (input.accountId && !(await accountBelongsToClient(input.clientId, input.accountId)))
  ) {
    return { ok: false, error: "不正なリクエストです" };
  }
  if (!input.name.trim()) return { ok: false, error: "相手先名を入力してください" };
  const error = validateTerm(input.closingDay, input.monthsAfter, input.settlementDay);
  if (error) return { ok: false, error };

  try {
    await prisma.counterparty.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        direction: input.direction,
        accountId: input.accountId,
        closingDay: input.closingDay,
        monthsAfter: input.monthsAfter,
        settlementDay: input.settlementDay,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "保存に失敗しました" };
  }

  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}

export async function deleteCounterparty(input: { clientId: string; id: string }): Promise<ActionResult> {
  await requireClientAccess(input.clientId);
  if (!(await counterpartyBelongsToClient(input.clientId, input.id))) {
    return { ok: false, error: "不正なリクエストです" };
  }

  try {
    await prisma.counterparty.delete({ where: { id: input.id } });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "削除に失敗しました" };
  }

  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}
