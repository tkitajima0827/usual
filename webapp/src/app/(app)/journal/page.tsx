import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";

export default async function JournalPage(props: PageProps<"/journal">) {
  const { business } = await requireCurrentBusiness();
  const searchParams = await props.searchParams;

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });
  const fiscalPeriod =
    fiscalPeriods.find((fp) => fp.id === searchParams.fiscalPeriodId) ?? fiscalPeriods[0];

  if (!fiscalPeriod) {
    return <p className="text-sm text-red-600">会計期間が登録されていません。</p>;
  }

  const month = typeof searchParams.month === "string" ? searchParams.month : "";

  const entries = await prisma.journalEntry.findMany({
    where: {
      businessId: business.id,
      fiscalPeriodId: fiscalPeriod.id,
      ...(month ? { month } : {}),
    },
    orderBy: { date: "asc" },
    take: 500,
  });

  const exportQuery = new URLSearchParams({ fiscalPeriodId: fiscalPeriod.id });
  if (month) exportQuery.set("month", month);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">仕訳出力</h1>
        <p className="mt-1 text-sm text-slate-500">
          取引・月末時価評価から生成された仕訳です。MF会計インポート用のCSV/Excelを出力できます。
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">会計期間</label>
          <select
            name="fiscalPeriodId"
            defaultValue={fiscalPeriod.id}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {fiscalPeriods.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">対象月（任意）</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          表示
        </button>
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/journal/export?${exportQuery.toString()}&format=csv`}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            CSVダウンロード
          </a>
          <a
            href={`/api/journal/export?${exportQuery.toString()}&format=xlsx`}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Excelダウンロード
          </a>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">取引日</th>
              <th className="px-4 py-2">借方勘定科目</th>
              <th className="px-4 py-2">借方補助科目</th>
              <th className="px-4 py-2 text-right">借方金額</th>
              <th className="px-4 py-2">貸方勘定科目</th>
              <th className="px-4 py-2">貸方補助科目</th>
              <th className="px-4 py-2 text-right">貸方金額</th>
              <th className="px-4 py-2">摘要</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap">
                  {e.date.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-2">{e.debitAccount}</td>
                <td className="px-4 py-2">{e.debitSubAccount}</td>
                <td className="px-4 py-2 text-right">{e.debitAmount.toLocaleString()}</td>
                <td className="px-4 py-2">{e.creditAccount}</td>
                <td className="px-4 py-2">{e.creditSubAccount}</td>
                <td className="px-4 py-2 text-right">{e.creditAmount.toLocaleString()}</td>
                <td className="px-4 py-2">{e.memo}</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  仕訳がありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {entries.length === 500 ? (
        <p className="text-xs text-slate-400">
          先頭500件のみ表示しています。全件はダウンロードしたファイルでご確認ください。
        </p>
      ) : null}
    </div>
  );
}
