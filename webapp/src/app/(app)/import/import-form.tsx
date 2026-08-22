"use client";

import { useActionState } from "react";
import { importTradeHistoryAction, type ImportActionState } from "./actions";

const initialState: ImportActionState = { status: "idle" };

export default function ImportForm({
  fiscalPeriods,
}: {
  fiscalPeriods: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(importTradeHistoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="fiscalPeriodId">
          会計期間
        </label>
        <select
          id="fiscalPeriodId"
          name="fiscalPeriodId"
          required
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
        <label className="text-sm font-medium text-slate-700" htmlFor="month">
          対象月 (YYYY-MM)
        </label>
        <input
          id="month"
          name="month"
          type="month"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="file">
          元データ（約定履歴 .xlsx / .csv）
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-white"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "取込中..." : "取り込む"}
      </button>

      {state.status === "success" ? (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">{state.message}</div>
      ) : null}
      {state.status === "error" ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.message}</div>
      ) : null}
      {state.warnings && state.warnings.length > 0 ? (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-medium">警告:</p>
          <ul className="list-disc pl-5">
            {state.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
