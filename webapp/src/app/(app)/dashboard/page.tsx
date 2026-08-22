import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import { getSpotPositionAsOfMonth } from "@/lib/engine/spotPosition";
import { getMonthlyTotals } from "@/lib/engine/monthlySnapshot";
import TrendChart from "./trend-chart";

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { business } = await requireCurrentBusiness();
  const searchParams = await props.searchParams;

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });
  const fiscalPeriod =
    fiscalPeriods.find((fp) => fp.id === searchParams.fiscalPeriodId) ?? fiscalPeriods[0];

  if (!fiscalPeriod) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{business.name} ダッシュボード</h1>
        <p className="mt-4 text-sm text-slate-500">
          会計期間が未登録です。管理画面から会計期間を作成し、期首残高とデータ取込を行ってください。
        </p>
      </div>
    );
  }

  const monthlyTotals = await getMonthlyTotals(business.id, fiscalPeriod.id, fiscalPeriod);
  const defaultMonth = monthlyTotals.at(-1)?.month ?? "";
  const month = typeof searchParams.month === "string" && searchParams.month ? searchParams.month : defaultMonth;

  const positions = month
    ? await getSpotPositionAsOfMonth(business.id, fiscalPeriod.id, month)
    : [];

  const valuations = month
    ? await prisma.valuation.findMany({
        where: { businessId: business.id, fiscalPeriodId: fiscalPeriod.id, month },
      })
    : [];
  const valuationBySecurity = new Map(valuations.map((v) => [v.securityId, v]));

  const totalBookValue = positions.reduce((sum, p) => sum + p.bookValue, 0);
  const totalMarketValue = valuations.reduce((sum, v) => sum + v.marketValue, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">{business.name} ダッシュボード</h1>
        <form className="flex items-end gap-3">
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
            <label className="text-xs text-slate-500">表示月</label>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{month} 現物帳簿価額合計</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalBookValue.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{month} 時価評価額合計</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {valuations.length > 0 ? totalMarketValue.toLocaleString() : "未評価"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">期首からの累積実現損益</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {(monthlyTotals.find((t) => t.month === month)?.realizedGainCumulative ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">月別推移</h2>
        <TrendChart data={monthlyTotals} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{month} 月末保有銘柄</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">銘柄</th>
                <th className="px-4 py-2 text-right">株数</th>
                <th className="px-4 py-2 text-right">帳簿価額</th>
                <th className="px-4 py-2 text-right">評価額</th>
                <th className="px-4 py-2 text-right">評価損益</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const v = valuationBySecurity.get(p.securityId);
                return (
                  <tr key={p.securityId} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {p.code} {p.name}
                    </td>
                    <td className="px-4 py-2 text-right">{p.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{p.bookValue.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{v ? v.marketValue.toLocaleString() : "-"}</td>
                    <td
                      className={`px-4 py-2 text-right ${
                        v && v.gainLoss < 0 ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {v ? v.gainLoss.toLocaleString() : "-"}
                    </td>
                  </tr>
                );
              })}
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    保有銘柄がありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
