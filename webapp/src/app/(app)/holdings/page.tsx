import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import AutoSubmitSelect from "@/components/auto-submit-select";

export default async function HoldingsPage(props: PageProps<"/holdings">) {
  const { business } = await requireCurrentBusiness();
  const searchParams = await props.searchParams;

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });

  const fiscalPeriodId =
    typeof searchParams.fiscalPeriodId === "string"
      ? searchParams.fiscalPeriodId
      : fiscalPeriods[0]?.id;

  if (!fiscalPeriodId) {
    return <p className="text-sm text-red-600">会計期間が登録されていません。</p>;
  }

  const securities = await prisma.security.findMany({
    where: { businessId: business.id },
    orderBy: { code: "asc" },
  });

  const ledgerEntries = await prisma.costLedgerEntry.findMany({
    where: { businessId: business.id, fiscalPeriodId },
    orderBy: { createdAt: "asc" },
  });

  type Row = {
    code: string;
    name: string;
    spotQuantity: number;
    spotBookValue: number;
    marginLongQuantity: number;
    marginLongBookValue: number;
    marginShortQuantity: number;
    marginShortBookValue: number;
    realizedGain: number;
  };
  const rows = new Map<string, Row>();

  for (const security of securities) {
    rows.set(security.id, {
      code: security.code,
      name: security.name,
      spotQuantity: 0,
      spotBookValue: 0,
      marginLongQuantity: 0,
      marginLongBookValue: 0,
      marginShortQuantity: 0,
      marginShortBookValue: 0,
      realizedGain: 0,
    });
  }

  for (const entry of ledgerEntries) {
    const row = rows.get(entry.securityId);
    if (!row) continue;
    if (entry.lotType === "SPOT") {
      row.spotQuantity = entry.quantityAfter;
      row.spotBookValue = entry.bookValueAfter;
    } else if (entry.lotType === "MARGIN_LONG") {
      row.marginLongQuantity = entry.quantityAfter;
      row.marginLongBookValue = entry.bookValueAfter;
    } else if (entry.lotType === "MARGIN_SHORT") {
      row.marginShortQuantity = entry.quantityAfter;
      row.marginShortBookValue = entry.bookValueAfter;
    }
    if (entry.realizedGain !== null) {
      row.realizedGain += entry.realizedGain;
    }
  }

  const activeRows = [...rows.values()].filter(
    (r) =>
      r.spotQuantity !== 0 ||
      r.marginLongQuantity !== 0 ||
      r.marginShortQuantity !== 0 ||
      r.realizedGain !== 0,
  );

  const totalRealizedGain = activeRows.reduce((sum, r) => sum + r.realizedGain, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">銘柄別損益</h1>
          <p className="mt-1 text-sm text-slate-500">
            移動平均法による銘柄ごとの現在残高と、当期の実現損益の一覧です。
          </p>
        </div>
        <form>
          <AutoSubmitSelect
            name="fiscalPeriodId"
            defaultValue={fiscalPeriodId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {fiscalPeriods.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">銘柄</th>
              <th className="px-4 py-2 text-right">現物株数</th>
              <th className="px-4 py-2 text-right">現物帳簿価額</th>
              <th className="px-4 py-2 text-right">信用買建株数</th>
              <th className="px-4 py-2 text-right">信用売建株数</th>
              <th className="px-4 py-2 text-right">当期実現損益</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.code} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {r.code} {r.name}
                </td>
                <td className="px-4 py-2 text-right">{r.spotQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{Math.round(r.spotBookValue).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{r.marginLongQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{r.marginShortQuantity.toLocaleString()}</td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    r.realizedGain < 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {Math.round(r.realizedGain).toLocaleString()}
                </td>
              </tr>
            ))}
            {activeRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  データがありません。データ取込を行ってください。
                </td>
              </tr>
            ) : null}
          </tbody>
          {activeRows.length > 0 ? (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={5}>
                  合計
                </td>
                <td className="px-4 py-2 text-right">{Math.round(totalRealizedGain).toLocaleString()}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
