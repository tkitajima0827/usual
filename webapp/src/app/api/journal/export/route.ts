import { NextRequest, NextResponse } from "next/server";
import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import { buildJournalCsv, buildJournalXlsx } from "@/lib/export/journalExport";

export async function GET(request: NextRequest) {
  const { business } = await requireCurrentBusiness();

  const { searchParams } = new URL(request.url);
  const fiscalPeriodId = searchParams.get("fiscalPeriodId");
  const month = searchParams.get("month");
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (!fiscalPeriodId) {
    return NextResponse.json({ error: "fiscalPeriodId is required" }, { status: 400 });
  }

  const fiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId, businessId: business.id },
  });
  if (!fiscalPeriod) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const entries = await prisma.journalEntry.findMany({
    where: {
      businessId: business.id,
      fiscalPeriodId,
      ...(month ? { month } : {}),
    },
    orderBy: { date: "asc" },
  });

  const rows = entries.map((e) => ({
    date: e.date,
    debitAccount: e.debitAccount,
    debitSubAccount: e.debitSubAccount,
    debitAmount: e.debitAmount,
    creditAccount: e.creditAccount,
    creditSubAccount: e.creditSubAccount,
    creditAmount: e.creditAmount,
    memo: e.memo,
  }));

  const fileLabel = month ? `${fiscalPeriod.label}_${month}` : fiscalPeriod.label;

  if (format === "xlsx") {
    const buffer = await buildJournalXlsx(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="journal_${fileLabel}.xlsx"`,
      },
    });
  }

  const csv = buildJournalCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal_${fileLabel}.csv"`,
    },
  });
}
