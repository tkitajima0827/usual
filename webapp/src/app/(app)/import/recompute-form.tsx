"use client";

import { useActionState } from "react";
import { recomputeFiscalPeriodAction, type RecomputeActionState } from "./actions";

const initialState: RecomputeActionState = { status: "idle" };

export default function RecomputeForm({
  fiscalPeriods,
}: {
  fiscalPeriods: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(recomputeFiscalPeriodAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">会計期間を再計算する</h3>
      <p className="text-xs text-slate-500">
        取込の順番を入れ替えたり期首残高を修正したりした後、原価・実現損益・仕訳を現在のデータで
        計算し直します(通常は保存のたびに自動で再計算されますが、念のため確認したいときに使ってください)。
        「残数量を超える決済数量」の警告が出た場合は、期首残高または取込データに不足・誤りがある
        可能性があります。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <select name="fiscalPeriodId" required className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          {fiscalPeriods.map((fp) => (
            <option key={fp.id} value={fp.id}>
              {fp.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "再計算中..." : "この会計期間を再計算する"}
        </button>
      </div>
      {state.status === "success" ? <p className="text-sm text-green-700">{state.message}</p> : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{state.message}</p> : null}
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
