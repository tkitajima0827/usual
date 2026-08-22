import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminToken } from "@/lib/adminApi/auth";
import type { TaxAccountingMethod } from "@/generated/prisma/client";

export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const name: string | undefined = body?.name;
  const fiscalYearStartMonth: number | undefined = body?.fiscalYearStartMonth;
  const taxMethod: TaxAccountingMethod | undefined = body?.taxMethod;

  if (!name || !fiscalYearStartMonth || !taxMethod) {
    return NextResponse.json(
      { error: "name, fiscalYearStartMonth, taxMethod は必須です" },
      { status: 400 },
    );
  }
  if (taxMethod !== "INCLUSIVE" && taxMethod !== "EXCLUSIVE") {
    return NextResponse.json({ error: "taxMethod は INCLUSIVE または EXCLUSIVE" }, { status: 400 });
  }

  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) {
    return NextResponse.json({ id: existing.id, name: existing.name, created: false });
  }

  const client = await prisma.client.create({
    data: { name, fiscalYearStartMonth, taxMethod },
  });
  return NextResponse.json({ id: client.id, name: client.name, created: true }, { status: 201 });
}
