import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import { getSpotPositionAsOfMonth } from "@/lib/engine/spotPosition";
import ValuationForm from "./valuation-form";

function currentMonthKey(fiscalPeriod?: { startDate: Date; endDate: Date }): string {
  const now = fiscalPeriod ? fiscalPeriod.endDate : new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ValuationPage(props: PageProps<"/valuation">) {
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

  const month =
    typeof searchParams.month === "string" && searchParams.month
      ? searchParams.month
      : currentMonthKey(fiscalPeriod);

  const positions = await getSpotPositionAsOfMonth(business.id, fiscalPeriod.id, month);

  const existingValuations = await prisma.valuation.findMany({
    where: { businessId: business.id, fiscalPeriodId: fiscalPeriod.id, month },
  });
  const existingPrices = new Map(existingValuations.map((v) => [v.securityId, v.unitPrice]));

  const totalGainLoss = existingValuations.reduce((sum, v) => sum + v.gainLoss, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">月末時価評価</h1>
        <p className="mt-1 text-sm text-slate-500">
          売買目的有価証券について、月末時点の株価を入力すると帳簿残高との差額を評価損益として計算します。
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
          <label className="text-xs text-slate-500">対象月</label>
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
      </form>

      <ValuationForm
        fiscalPeriodId={fiscalPeriod.id}
        month={month}
        positions={positions}
        existingPrices={existingPrices}
      />

      {existingValuations.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">銘柄</th>
                <th className="px-4 py-2 text-right">株数</th>
                <th className="px-4 py-2 text-right">帳簿価額</th>
                <th className="px-4 py-2 text-right">単価</th>
                <th className="px-4 py-2 text-right">評価額</th>
                <th className="px-4 py-2 text-right">評価損益</th>
              </tr>
            </thead>
            <tbody>
              {existingValuations.map((v) => {
                const pos = positions.find((p) => p.securityId === v.securityId);
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {pos ? `${pos.code} ${pos.name}` : v.securityId}
                    </td>
                    <td className="px-4 py-2 text-right">{v.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{v.bookValue.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{v.unitPrice.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{v.marketValue.toLocaleString()}</td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        v.gainLoss < 0 ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {v.gainLoss.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={5}>
                  合計評価損益
                </td>
                <td className="px-4 py-2 text-right">{totalGainLoss.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
