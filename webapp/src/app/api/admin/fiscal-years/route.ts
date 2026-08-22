import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminToken } from "@/lib/adminApi/auth";

// scripts/create-default-plan.ts と同じロジック（会計年度の作成/取得 + 全PL科目を
// 「過去平均」で初期設定）。実績データが取り込まれていればどの顧客にも使える。
export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const clientId: string | undefined = body?.clientId;
  const startYear: number | undefined = body?.startYear;
  const startMonth: number | undefined = body?.startMonth;
  const label: string | undefined = body?.label;

  if (!clientId || !startYear || !startMonth) {
    return NextResponse.json({ error: "clientId, startYear, startMonth は必須です" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: `clientId が見つかりません: ${clientId}` }, { status: 400 });
  }

  const accounts = await prisma.account.findMany({
    where: { clientId, isActive: true, statement: "PL" },
  });

  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { clientId_startYear_startMonth: { clientId, startYear, startMonth } },
    create: { clientId, label: label ?? `${startYear}年度`, startYear, startMonth },
    update: {},
  });

  let createdPlanEntries = 0;
  for (const account of accounts) {
    const existing = await prisma.planEntry.findUnique({
      where: { fiscalYearId_accountId: { fiscalYearId: fiscalYear.id, accountId: account.id } },
    });
    if (existing) continue;
    await prisma.planEntry.create({
      data: { fiscalYearId: fiscalYear.id, accountId: account.id, calcMethod: "PAST_AVERAGE" },
    });
    createdPlanEntries++;
  }

  return NextResponse.json(
    {
      id: fiscalYear.id,
      label: fiscalYear.label,
      accountCount: accounts.length,
      createdPlanEntries,
    },
    { status: 201 },
  );
}
