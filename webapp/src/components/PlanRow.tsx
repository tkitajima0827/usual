"use client";

import { Fragment, useState, useTransition } from "react";
import { updatePlanEntry } from "@/lib/actions/planEntry";
import { CALC_METHOD_LABEL } from "@/lib/labels";
import { formatYen } from "@/lib/format";
import type { CalcMethod } from "@/generated/prisma/client";

// MFクラウド会計などの外部連携科目は、コードとして人間には読めないURLエンコード
// された内部IDが入る（安定した突合キーとして採用しているため）。表示上は隠す。
function isDisplayableCode(code: string): boolean {
  return !code.includes("%") && code.length <= 12;
}

const CALC_METHOD_COLOR: Record<string, string> = {
  PREV_YEAR_SAME: "var(--calc-prev-year)",
  LINKED: "var(--calc-linked)",
  DIRECT: "var(--calc-direct)",
  PAST_AVERAGE: "var(--calc-past-avg)",
};

const CALC_METHODS: { value: CalcMethod; label: string }[] = [
  { value: "PREV_YEAR_SAME", label: CALC_METHOD_LABEL.PREV_YEAR_SAME },
  { value: "LINKED", label: CALC_METHOD_LABEL.LINKED },
  { value: "DIRECT", label: CALC_METHOD_LABEL.DIRECT },
  { value: "PAST_AVERAGE", label: CALC_METHOD_LABEL.PAST_AVERAGE },
];

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

const inputClass =
  "rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]";

export interface PlanRowProps {
  clientId: string;
  fiscalYearId: string;
  accountId: string;
  code: string;
  name: string;
  calcMethod: string;
  linkedAccountId?: string;
  linkedAccountName?: string;
  linkedPercentage?: number;
  months: { year: number; month: number; amount: number; isActual: boolean }[];
  total: number;
  /** 前期（1年前）の同月実績。bixidに倣い当期行の上に薄い表示で並べる */
  priorYearMonths: (number | null)[];
  priorYearTotal: number | null;
  warnings: string[];
  accountOptions: { id: string; name: string }[];
}

export function PlanRow(props: PlanRowProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [calcMethod, setCalcMethod] = useState<CalcMethod>(props.calcMethod as CalcMethod);
  const [linkedAccountId, setLinkedAccountId] = useState(props.linkedAccountId ?? "");
  const [linkedPercentage, setLinkedPercentage] = useState(props.linkedPercentage ?? 0);
  const [directValues, setDirectValues] = useState(props.months.map((m) => m.amount));

  function startEdit() {
    setCalcMethod(props.calcMethod as CalcMethod);
    setLinkedAccountId(props.linkedAccountId ?? "");
    setLinkedPercentage(props.linkedPercentage ?? 0);
    setDirectValues(props.months.map((m) => m.amount));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePlanEntry({
        clientId: props.clientId,
        fiscalYearId: props.fiscalYearId,
        accountId: props.accountId,
        calcMethod,
        linkedAccountId: calcMethod === "LINKED" ? linkedAccountId : null,
        linkedPercentage: calcMethod === "LINKED" ? linkedPercentage : null,
        directValues:
          calcMethod === "DIRECT"
            ? props.months.map((m, i) => ({ year: m.year, month: m.month, amount: directValues[i] }))
            : undefined,
      });
      if (result.ok) {
        setEditing(false);
      } else {
        setError(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <Fragment>
      {/* 前期（1年前）実績行: bixidに倣い当期行の直上に薄い色で表示する */}
      <tr className="text-[var(--text-muted)]">
        <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-3 py-1 text-xs">前期</td>
        <td className="px-3 py-1" />
        {props.priorYearMonths.map((amount, i) => (
          <td key={i} className="whitespace-nowrap px-3 py-1 text-right text-xs tabular-nums">
            {amount === null ? "―" : formatYen(amount)}
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-1 text-right text-xs tabular-nums">
          {props.priorYearTotal === null ? "―" : formatYen(props.priorYearTotal)}
        </td>
        <td />
      </tr>
      <tr className="border-b border-[var(--gridline)] align-top last:border-b-0">
        <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-3 py-2">
          <div className="flex items-center gap-1 font-medium">
            <span>{props.name}</span>
            {props.warnings.length > 0 && (
              <span
                title={props.warnings.join("\n")}
                className="cursor-help text-[var(--status-warning)]"
                aria-label="この科目には警告があります"
              >
                ⚠
              </span>
            )}
          </div>
          {isDisplayableCode(props.code) && <div className="text-xs text-[var(--text-muted)]">{props.code}</div>}
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <div className="flex flex-col gap-1">
              <select
                className={inputClass}
                value={calcMethod}
                onChange={(e) => setCalcMethod(e.target.value as CalcMethod)}
              >
                {CALC_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {calcMethod === "LINKED" && (
                <div className="flex items-center gap-1">
                  <select
                    className={inputClass}
                    value={linkedAccountId}
                    onChange={(e) => setLinkedAccountId(e.target.value)}
                  >
                    <option value="">連動先を選択</option>
                    {props.accountOptions
                      .filter((a) => a.id !== props.accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    className={`${inputClass} w-16`}
                    value={linkedPercentage}
                    onChange={(e) => setLinkedPercentage(Number(e.target.value))}
                  />
                  <span className="text-xs text-[var(--text-muted)]">%</span>
                </div>
              )}
            </div>
          ) : (
            <CalcMethodBadge
              calcMethod={props.calcMethod}
              linkedAccountName={props.linkedAccountName}
              linkedPercentage={props.linkedPercentage}
            />
          )}
        </td>
        {props.months.map((m, i) => (
          <td
            key={i}
            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${m.isActual ? "bg-[var(--page-plane)]" : ""}`}
          >
            {editing && calcMethod === "DIRECT" ? (
              <input
                type="number"
                className={`${inputClass} w-24 text-right disabled:opacity-40`}
                value={directValues[i]}
                disabled={m.isActual}
                title={m.isActual ? "実績が確定済みのため、直接入力の値は使用されません" : undefined}
                onChange={(e) =>
                  setDirectValues((prev) => prev.map((v, j) => (j === i ? Number(e.target.value) : v)))
                }
              />
            ) : (
              <span className={m.amount < 0 ? "text-[var(--status-critical)]" : ""}>{formatYen(m.amount)}</span>
            )}
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatYen(props.total)}</td>
        <td className="px-3 py-2 text-right">
          {editing ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded bg-[var(--series-1)] px-2 py-0.5 text-xs text-white disabled:opacity-50"
                >
                  {pending ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={pending}
                  className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-xs"
                >
                  キャンセル
                </button>
              </div>
              {error && (
                <div className="max-w-[160px] text-right text-[11px] text-[var(--status-critical)]">{error}</div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
            >
              編集
            </button>
          )}
        </td>
      </tr>
    </Fragment>
  );
}
