import { Fragment } from "react";
import { CALC_METHOD_LABEL, type PlanViewModel } from "@/lib/queries";
import { formatYen, MONTH_LABELS } from "@/lib/format";

const CALC_METHOD_COLOR: Record<string, string> = {
  PREV_YEAR_SAME: "var(--calc-prev-year)",
  LINKED: "var(--calc-linked)",
  DIRECT: "var(--calc-direct)",
  PAST_AVERAGE: "var(--calc-past-avg)",
};

function CalcMethodBadge({
  calcMethod,
  linkedAccountName,
  linkedPercentage,
}: {
  calcMethod: string;
  linkedAccountName?: string;
  linkedPercentage?: number;
}) {
  const color = CALC_METHOD_COLOR[calcMethod] ?? "var(--text-muted)";
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
        style={{ borderColor: color, color }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {CALC_METHOD_LABEL[calcMethod] ?? calcMethod}
      </span>
      {calcMethod === "LINKED" && linkedAccountName && (
        <span className="text-[11px] text-[var(--text-muted)]">
          {linkedAccountName} × {linkedPercentage}%
        </span>
      )}
    </div>
  );
}

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
    </tr>
  );
}

export function PlanTable({ data }: { data: PlanViewModel }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <table className="w-full min-w-[1400px] border-collapse text-sm">
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
          </tr>
        </thead>
        <tbody>
          {data.categories.map((group) => (
            <Fragment key={group.category}>
              <tr className="bg-[var(--page-plane)]">
                <td
                  colSpan={2 + data.monthLabels.length + 1}
                  className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {group.label}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.accountId} className="border-b border-[var(--gridline)] last:border-b-0">
                  <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{row.code}</div>
                  </td>
                  <td className="px-3 py-2">
                    <CalcMethodBadge
                      calcMethod={row.calcMethod}
                      linkedAccountName={row.linkedAccountName}
                      linkedPercentage={row.linkedPercentage}
                    />
                  </td>
                  {row.months.map((amount, i) => (
                    <AmountCell key={i} amount={amount} />
                  ))}
                  <AmountCell amount={row.total} strong />
                </tr>
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
