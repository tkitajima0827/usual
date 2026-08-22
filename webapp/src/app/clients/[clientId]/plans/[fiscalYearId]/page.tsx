import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanViewModel } from "@/lib/queries";
import { StatTile } from "@/components/StatTile";
import { TrendChart } from "@/components/TrendChart";
import { PlanTable } from "@/components/PlanTable";
import { TaxEstimateCard } from "@/components/TaxEstimateCard";
import { MONTH_LABELS } from "@/lib/format";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ clientId: string; fiscalYearId: string }>;
}) {
  const { clientId, fiscalYearId } = await params;
  const data = await getPlanViewModel(fiscalYearId).catch(() => null);
  if (!data) notFound();

  const revenueRow = data.categories.find((c) => c.category === "REVENUE");
  const salesTrend =
    revenueRow?.monthTotals.map((amount, i) => ({
      label: MONTH_LABELS[data.monthLabels[i].month - 1],
      value: amount,
    })) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <Link href={`/clients/${clientId}`} className="text-sm text-[var(--text-secondary)] hover:underline">
        &larr; {data.client.name}
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">
          {data.client.name} - {data.fiscalYear.label} 単年度PL計画
        </h1>
      </div>

      {data.errors.length > 0 && (
        <div className="mt-4 rounded-lg border border-[var(--status-critical)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {data.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="売上高計画（年間）" amount={revenueRow?.total ?? 0} />
        <StatTile label="売上総利益（年間）" amount={data.subtotals.grossProfit.total} />
        <StatTile label="営業利益（年間）" amount={data.subtotals.operatingIncome.total} accent={data.subtotals.operatingIncome.total >= 0 ? "good" : "critical"} />
        <StatTile label="経常利益（年間）" amount={data.subtotals.ordinaryIncome.total} accent={data.subtotals.ordinaryIncome.total >= 0 ? "good" : "critical"} />
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">月次売上高計画の推移</h2>
        <div className="mt-2">
          <TrendChart points={salesTrend} />
        </div>
      </div>

      <TaxEstimateCard clientId={clientId} fiscalYearId={fiscalYearId} data={data.taxEstimate} />

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
          勘定科目別 月次計画（計算方式: 前年同額 / 科目連動 / 直接入力 / 過去平均）
        </h2>
        <PlanTable data={data} />
      </div>
    </div>
  );
}
