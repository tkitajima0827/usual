"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business-context";
import { recomputeFiscalPeriod } from "@/lib/engine/recompute";
import { getClosingPosition } from "@/lib/engine/closingPosition";
import { parseBalanceCertificate, MissingApiKeyError, type ParsedHoldingRow } from "@/lib/ocr/parseBalanceCertificate";

export interface OpeningBalanceActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

interface OpeningBalanceRowInput {
  code: string;
  name: string;
  spotQuantity: number;
  spotBookValue: number;
  marginLongQuantity: number;
  marginLongBookValue: number;
  marginShortQuantity: number;
  marginShortBookValue: number;
}

async function upsertOpeningBalanceRow(
  businessId: string,
  fiscalPeriodId: string,
  row: OpeningBalanceRowInput,
) {
  const security = await prisma.security.upsert({
    where: { businessId_code: { businessId, code: row.code } },
    update: { name: row.name },
    create: { businessId, code: row.code, name: row.name },
  });

  await prisma.openingBalance.upsert({
    where: { fiscalPeriodId_securityId: { fiscalPeriodId, securityId: security.id } },
    update: {
      spotQuantity: row.spotQuantity,
      spotBookValue: row.spotBookValue,
      marginLongQuantity: row.marginLongQuantity,
      marginLongBookValue: row.marginLongBookValue,
      marginShortQuantity: row.marginShortQuantity,
      marginShortBookValue: row.marginShortBookValue,
    },
    create: {
      businessId,
      fiscalPeriodId,
      securityId: security.id,
      spotQuantity: row.spotQuantity,
      spotBookValue: row.spotBookValue,
      marginLongQuantity: row.marginLongQuantity,
      marginLongBookValue: row.marginLongBookValue,
      marginShortQuantity: row.marginShortQuantity,
      marginShortBookValue: row.marginShortBookValue,
    },
  });
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

  await upsertOpeningBalanceRow(business.id, fiscalPeriodId, {
    code,
    name,
    spotQuantity,
    spotBookValue,
    marginLongQuantity,
    marginLongBookValue,
    marginShortQuantity,
    marginShortBookValue,
  });

  await recomputeFiscalPeriod(business.id, fiscalPeriodId);

  revalidatePath("/opening-balance");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");

  return { status: "success", message: `${name}（${code}）の期首残高を保存しました。` };
}

export interface CarryForwardActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * 前の会計期間の期末残高(=最後の取引後の残高、取引がない銘柄は期首残高)を、
 * 指定した会計期間の期首残高としてそのまま複製する。既存の期首残高は上書きされる。
 */
export async function carryForwardOpeningBalanceAction(
  _prev: CarryForwardActionState,
  formData: FormData,
): Promise<CarryForwardActionState> {
  const { business } = await requireCurrentBusiness();
  const sourceFiscalPeriodId = String(formData.get("sourceFiscalPeriodId") ?? "");
  const targetFiscalPeriodId = String(formData.get("targetFiscalPeriodId") ?? "");

  if (!sourceFiscalPeriodId || !targetFiscalPeriodId) {
    return { status: "error", message: "引き継ぎ元・引き継ぎ先の会計期間を選択してください。" };
  }
  if (sourceFiscalPeriodId === targetFiscalPeriodId) {
    return { status: "error", message: "引き継ぎ元と引き継ぎ先には別の会計期間を選択してください。" };
  }

  const [source, target] = await Promise.all([
    prisma.fiscalPeriod.findFirst({ where: { id: sourceFiscalPeriodId, businessId: business.id } }),
    prisma.fiscalPeriod.findFirst({ where: { id: targetFiscalPeriodId, businessId: business.id } }),
  ]);
  if (!source || !target) {
    return { status: "error", message: "会計期間が見つかりません。" };
  }

  const closingPositions = await getClosingPosition(business.id, sourceFiscalPeriodId);
  if (closingPositions.length === 0) {
    return { status: "error", message: `${source.label}に残高がありません。` };
  }

  for (const row of closingPositions) {
    await upsertOpeningBalanceRow(business.id, targetFiscalPeriodId, row);
  }

  await recomputeFiscalPeriod(business.id, targetFiscalPeriodId);

  revalidatePath("/opening-balance");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");

  return {
    status: "success",
    message: `${source.label}の期末残高を${target.label}の期首残高として${closingPositions.length}銘柄分引き継ぎました（既存の期首残高は上書きされます）。`,
  };
}

export interface ParseActionState {
  status: "idle" | "success" | "error";
  message?: string;
  rows?: ParsedHoldingRow[];
  fiscalPeriodId?: string;
}

export async function parseBalanceCertificateAction(
  _prev: ParseActionState,
  formData: FormData,
): Promise<ParseActionState> {
  const { business } = await requireCurrentBusiness();

  // アップロード時点で選ばれていた会計期間IDをそのまま結果に含めて返す。保存フォームは
  // 画面上のセレクトの「今の値」ではなく、この値を保存先として使う。読み取り後にセレクトの
  // 表示が別の期間に戻って見えることがあっても、実際の保存先は読み取り時に選んだ期間のまま
  // 変わらないようにするため。
  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return { status: "error", message: "会計期間を選択してください。" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "ファイルを選択してください。", fiscalPeriodId };
  }
  if (file.size > 15 * 1024 * 1024) {
    return {
      status: "error",
      message: "ファイルサイズが大きすぎます（15MB以下にしてください）。",
      fiscalPeriodId,
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseBalanceCertificate(buffer, file.type);
    if (rows.length === 0) {
      return {
        status: "error",
        message: "銘柄を読み取れませんでした。画像が鮮明か確認するか、手入力してください。",
        fiscalPeriodId,
      };
    }
    return { status: "success", rows, fiscalPeriodId };
  } catch (error) {
    console.error(error);
    if (error instanceof MissingApiKeyError) {
      return {
        status: "error",
        message: "AI読み取り機能が設定されていません（管理者にANTHROPIC_API_KEYの設定を確認してください）。",
        fiscalPeriodId,
      };
    }
    return {
      status: "error",
      message: "読み取りに失敗しました。もう一度お試しいただくか、手入力してください。",
      fiscalPeriodId,
    };
  }
}

export async function bulkSaveOpeningBalanceAction(
  _prev: OpeningBalanceActionState,
  formData: FormData,
): Promise<OpeningBalanceActionState> {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const rowsRaw = String(formData.get("rows") ?? "[]");

  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return { status: "error", message: "会計期間が見つかりません。" };
  }

  let rows: OpeningBalanceRowInput[];
  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    return { status: "error", message: "データの形式が不正です。" };
  }

  const validRows = rows.filter((r) => r.code?.trim() && r.name?.trim());
  if (validRows.length === 0) {
    return { status: "error", message: "保存する銘柄がありません。" };
  }

  for (const row of validRows) {
    await upsertOpeningBalanceRow(business.id, fiscalPeriodId, row);
  }

  await recomputeFiscalPeriod(business.id, fiscalPeriodId);

  revalidatePath("/opening-balance");
  revalidatePath("/dashboard");
  revalidatePath("/holdings");

  return { status: "success", message: `${validRows.length}件の期首残高を保存しました。` };
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
