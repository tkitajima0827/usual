"use client";

import { useActionState } from "react";
import { saveOpeningBalanceAction, type OpeningBalanceActionState } from "./actions";

const initialState: OpeningBalanceActionState = { status: "idle" };

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

export default function OpeningBalanceForm({
  fiscalPeriods,
}: {
  fiscalPeriods: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveOpeningBalanceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">会計期間</label>
          <select name="fiscalPeriodId" required className={inputClass}>
            {fiscalPeriods.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">銘柄コード</label>
          <input name="code" required className={inputClass} placeholder="例: 9433" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">銘柄名</label>
          <input name="name" required className={inputClass} placeholder="例: ＫＤＤＩ" />
        </div>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">現物</legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">株数</label>
            <input name="spotQuantity" type="number" defaultValue={0} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">取得価額（円）</label>
            <input name="spotBookValue" type="number" defaultValue={0} className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">信用買建</legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">株数</label>
            <input name="marginLongQuantity" type="number" defaultValue={0} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">取得価額（円）</label>
            <input name="marginLongBookValue" type="number" defaultValue={0} className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">信用売建</legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">株数</label>
            <input name="marginShortQuantity" type="number" defaultValue={0} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">売付代金（円）</label>
            <input name="marginShortBookValue" type="number" defaultValue={0} className={inputClass} />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "保存中..." : "保存"}
      </button>

      {state.status === "success" ? (
        <p className="text-sm text-green-700">{state.message}</p>
      ) : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
