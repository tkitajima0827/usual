import { Fragment } from "react";
import type { PlanViewModel } from "@/lib/queries";
import { formatYen, MONTH_LABELS } from "@/lib/format";
import { PlanRow } from "@/components/PlanRow";

function AmountCell({ amount, strong = false }: { amount: number; strong?: boolean }) {
  const negative = amount < 0;
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""} ${
        negative ? "text-[var(--status-critical)]" : ""
      }`}
    >
      {formatYen(amount)}
    </td>
  );
}

function SubtotalRow({ label, monthTotals, total }: { label: string; monthTotals: number[]; total: number }) {
  return (
    <tr className="border-y border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-3 py-2 font-semibold" colSpan={2}>
        {label}
      </td>
      {monthTotals.map((v, i) => (
        <AmountCell key={i} amount={v} strong />
      ))}
      <AmountCell amount={total} strong />
      <td />
    </tr>
  );
}

export function PlanTable({ data }: { data: PlanViewModel }) {
  const accountOptions = data.categories.flatMap((c) => c.rows.map((r) => ({ id: r.accountId, name: r.name })));

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <table className="w-full min-w-[1560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-[var(--text-secondary)]">
            <th className="sticky left-0 z-10 min-w-[160px] bg-[var(--surface-1)] px-3 py-2 font-medium">
              勘定科目
            </th>
            <th className="min-w-[140px] px-3 py-2 font-medium">計算方式</th>
            {data.monthLabels.map((m) => (
              <th key={`${m.year}-${m.month}`} className="min-w-[96px] px-3 py-2 text-right font-medium">
                {m.year}/{MONTH_LABELS[m.month - 1]}
              </th>
            ))}
            <th className="min-w-[110px] px-3 py-2 text-right font-medium">年間合計</th>
            <th className="min-w-[90px] px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((group) => (
            <Fragment key={group.category}>
              <tr className="bg-[var(--page-plane)]">
                <td
                  colSpan={2 + data.monthLabels.length + 2}
                  className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {group.label}
                </td>
              </tr>
              {group.rows.map((row) => (
                <PlanRow
                  key={row.accountId}
                  clientId={data.client.id}
                  fiscalYearId={data.fiscalYear.id}
                  accountId={row.accountId}
                  code={row.code}
                  name={row.name}
                  calcMethod={row.calcMethod}
                  linkedAccountId={row.linkedAccountId}
                  linkedAccountName={row.linkedAccountName}
                  linkedPercentage={row.linkedPercentage}
                  months={row.months.map((amount, i) => ({ ...data.monthLabels[i], amount }))}
                  total={row.total}
                  warnings={row.warnings}
                  accountOptions={accountOptions}
                />
              ))}
              {group.category === "COGS" && (
                <SubtotalRow
                  label="売上総利益"
                  monthTotals={data.subtotals.grossProfit.monthTotals}
                  total={data.subtotals.grossProfit.total}
                />
              )}
              {group.category === "SGA" && (
                <SubtotalRow
                  label="営業利益"
                  monthTotals={data.subtotals.operatingIncome.monthTotals}
                  total={data.subtotals.operatingIncome.total}
                />
              )}
              {group.category === "NON_OPERATING_EXPENSE" && (
                <SubtotalRow
                  label="経常利益"
                  monthTotals={data.subtotals.ordinaryIncome.monthTotals}
                  total={data.subtotals.ordinaryIncome.total}
                />
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
