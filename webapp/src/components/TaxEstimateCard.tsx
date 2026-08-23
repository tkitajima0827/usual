"use client";

import { useState, useTransition } from "react";
import { updateTaxSettings } from "@/lib/actions/taxSettings";
import { formatYen } from "@/lib/format";
import type { TaxEstimateViewModel } from "@/lib/queries";

const inputClass =
  "rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]";

function EstimateTile({ label, amount, note }: { label: string; amount: number | null; note?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-4 py-3">
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${amount !== null && amount < 0 ? "text-[var(--status-critical)]" : ""}`}>
        {amount === null ? "―" : formatYen(amount)}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{note}</div>}
    </div>
  );
}

export function TaxEstimateCard({
  clientId,
  fiscalYearId,
  data,
}: {
  clientId: string;
  fiscalYearId: string;
  data: TaxEstimateViewModel;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [effectiveTaxRatePercent, setEffectiveTaxRatePercent] = useState(data.settings.effectiveTaxRatePercent);
  const [lossCarryforward, setLossCarryforward] = useState(data.settings.lossCarryforward);
  const [consumptionTaxRatePercent, setConsumptionTaxRatePercent] = useState(
    data.settings.consumptionTaxRatePercent,
  );
  const [priorYearCorporateTaxAnnual, setPriorYearCorporateTaxAnnual] = useState(
    data.settings.priorYearCorporateTaxAnnual ?? 0,
  );
  const [priorYearConsumptionTaxAnnual, setPriorYearConsumptionTaxAnnual] = useState(
    data.settings.priorYearConsumptionTaxAnnual ?? 0,
  );

  function startEdit() {
    setEffectiveTaxRatePercent(data.settings.effectiveTaxRatePercent);
    setLossCarryforward(data.settings.lossCarryforward);
    setConsumptionTaxRatePercent(data.settings.consumptionTaxRatePercent);
    setPriorYearCorporateTaxAnnual(data.settings.priorYearCorporateTaxAnnual ?? 0);
    setPriorYearConsumptionTaxAnnual(data.settings.priorYearConsumptionTaxAnnual ?? 0);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTaxSettings({
        clientId,
        fiscalYearId,
        effectiveTaxRatePercent,
        lossCarryforward,
        consumptionTaxRatePercent,
        priorYearCorporateTaxAnnual: priorYearCorporateTaxAnnual || null,
        priorYearConsumptionTaxAnnual: priorYearConsumptionTaxAnnual || null,
      });
      if (result.ok) {
        setEditing(false);
      } else {
        setError(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">税額概算（実効税率方式・本則課税ベース）</h2>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
          >
            申告データ登録
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EstimateTile
          label="概算法人税額（年間）"
          amount={data.corporateTax.estimatedAnnualTax}
          note={`課税所得 ${formatYen(data.corporateTax.taxableIncome)}`}
        />
        <EstimateTile
          label="概算消費税額（年間）"
          amount={data.consumptionTax.estimatedAnnualTax}
          note={data.consumptionTax.estimatedAnnualTax < 0 ? "還付見込み" : undefined}
        />
        <EstimateTile
          label="概算中間納付額（法人税）"
          amount={data.corporateTaxInterim}
          note={data.corporateTaxInterim === null ? "前期実績未登録" : "前期年税額の1/2"}
        />
        <EstimateTile
          label="概算中間納付額（消費税）"
          amount={data.consumptionTaxInterim}
          note={data.consumptionTaxInterim === null ? "前期実績未登録" : "前期年税額の1/2"}
        />
      </div>

      {editing && (
        <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              実効税率(%)
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={effectiveTaxRatePercent}
                onChange={(e) => setEffectiveTaxRatePercent(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              繰越欠損金(円)
              <input
                type="number"
                className={inputClass}
                value={lossCarryforward}
                onChange={(e) => setLossCarryforward(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              消費税率(%)
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={consumptionTaxRatePercent}
                onChange={(e) => setConsumptionTaxRatePercent(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              前期 法人税年税額(円)
              <input
                type="number"
                className={inputClass}
                value={priorYearCorporateTaxAnnual}
                onChange={(e) => setPriorYearCorporateTaxAnnual(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              前期 消費税年税額(円)
              <input
                type="number"
                className={inputClass}
                value={priorYearConsumptionTaxAnnual}
                onChange={(e) => setPriorYearConsumptionTaxAnnual(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded bg-[var(--series-1)] px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded border border-[var(--border-hairline)] px-3 py-1 text-xs"
            >
              キャンセル
            </button>
            {error && <span className="text-xs text-[var(--status-critical)]">{error}</span>}
          </div>
        </div>
      )}

      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        課税売上高 {formatYen(data.taxableRevenue)} − 課税仕入高 {formatYen(data.taxableExpense)} ×
        消費税率{data.settings.consumptionTaxRatePercent}% で概算。あくまで概算計算であり、実際の申告額とは異なります。
      </div>
    </div>
  );
}
