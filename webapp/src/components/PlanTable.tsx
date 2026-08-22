import { Fragment } from "react";
import type { PlanSubtotal, PlanViewModel } from "@/lib/queries";
import { formatYen, formatPercent, MONTH_LABELS } from "@/lib/format";
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

// bixidの経営計画画面に倣い、金額の小計（青系）の直下に構成比（黄系）を並べる
function RatioRow({ label, subtotal }: { label: string; subtotal: PlanSubtotal }) {
  return (
    <tr className="bg-[#fdf8e7]">
      <td className="sticky left-0 z-10 bg-[#fdf8e7] px-3 py-1.5 text-xs text-[var(--text-secondary)]" colSpan={2}>
        {label}
      </td>
      {subtotal.marginByMonth.map((v, i) => (
        <td key={i} className="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
          {v === null ? "―" : formatPercent(v)}
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
        {subtotal.margin === null ? "―" : formatPercent(subtotal.margin)}
      </td>
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
                <span
                  className="mr-1 inline-block rounded px-1 text-[10px] font-semibold"
                  style={{
                    color: m.isActual ? "var(--calc-direct)" : "var(--calc-past-avg)",
                    backgroundColor: m.isActual ? "color-mix(in srgb, var(--calc-direct) 12%, transparent)" : "color-mix(in srgb, var(--calc-past-avg) 12%, transparent)",
                  }}
                  title={m.isActual ? "実績確定済みの月" : "計画（未確定）の月"}
                >
                  {m.isActual ? "実" : "予"}
                </span>
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
                  months={row.months.map((m, i) => ({
                    year: data.monthLabels[i].year,
                    month: data.monthLabels[i].month,
                    amount: m.amount,
                    isActual: m.isActual,
                  }))}
                  total={row.total}
                  priorYearMonths={row.priorYearMonths}
                  priorYearTotal={row.priorYearTotal}
                  warnings={row.warnings}
                  accountOptions={accountOptions}
                  consumptionTaxCategory={row.consumptionTaxCategory}
                  plCategory={group.category}
                  settlementTermOverride={row.settlementTermOverride}
                  defaultSettlementTerm={
                    group.category === "REVENUE"
                      ? data.cashSchedule.defaultTerms.receivable
                      : group.category === "COGS"
                        ? data.cashSchedule.defaultTerms.payable
                        : undefined
                  }
                />
              ))}
              {group.category === "COGS" && (
                <>
                  <SubtotalRow
                    label="売上総利益"
                    monthTotals={data.subtotals.grossProfit.monthTotals}
                    total={data.subtotals.grossProfit.total}
                  />
                  <RatioRow label="売上総利益率" subtotal={data.subtotals.grossProfit} />
                </>
              )}
              {group.category === "SGA" && (
                <>
                  <SubtotalRow
                    label="営業利益"
                    monthTotals={data.subtotals.operatingIncome.monthTotals}
                    total={data.subtotals.operatingIncome.total}
                  />
                  <RatioRow label="営業利益率" subtotal={data.subtotals.operatingIncome} />
                </>
              )}
              {group.category === "NON_OPERATING_EXPENSE" && (
                <>
                  <SubtotalRow
                    label="経常利益"
                    monthTotals={data.subtotals.ordinaryIncome.monthTotals}
                    total={data.subtotals.ordinaryIncome.total}
                  />
                  <RatioRow label="経常利益率" subtotal={data.subtotals.ordinaryIncome} />
                </>
              )}
              {group.category === "EXTRAORDINARY_LOSS" && (
                <>
                  <SubtotalRow
                    label="税引前当期純利益"
                    monthTotals={data.subtotals.pretaxIncome.monthTotals}
                    total={data.subtotals.pretaxIncome.total}
                  />
                  <RatioRow label="税引前当期純利益率" subtotal={data.subtotals.pretaxIncome} />
                </>
              )}
              {group.category === "INCOME_TAXES" && (
                <>
                  <SubtotalRow
                    label="当期純利益"
                    monthTotals={data.subtotals.netIncome.monthTotals}
                    total={data.subtotals.netIncome.total}
                  />
                  <RatioRow label="当期純利益率" subtotal={data.subtotals.netIncome} />
                </>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
