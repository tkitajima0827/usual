import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminToken } from "@/lib/adminApi/auth";
import { importMonthlyActuals, type ActualImportRow } from "@/lib/import/actuals";

export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const clientId: string | undefined = body?.clientId;
  const rows: ActualImportRow[] | undefined = body?.rows;

  if (!clientId || !Array.isArray(rows)) {
    return NextResponse.json({ error: "clientId と rows(配列) は必須です" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: `clientId が見つかりません: ${clientId}` }, { status: 400 });
  }

  const summary = await importMonthlyActuals(prisma, clientId, rows);
  return NextResponse.json(summary, { status: 201 });
}
