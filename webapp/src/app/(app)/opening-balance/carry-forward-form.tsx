"use client";

import { useActionState } from "react";
import { carryForwardOpeningBalanceAction, type CarryForwardActionState } from "./actions";

const initialState: CarryForwardActionState = { status: "idle" };

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

export default function CarryForwardForm({
  fiscalPeriods,
}: {
  fiscalPeriods: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(carryForwardOpeningBalanceAction, initialState);

  if (fiscalPeriods.length < 2) return null;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-700">前期末の残高を引き継ぐ</h3>
      <p className="text-xs text-slate-500">
        前の会計期間の最終的な残高（取引がない銘柄は前期の期首残高）を、選んだ会計期間の期首残高としてそのままコピーします。既存の期首残高がある場合は上書きされます。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">引き継ぎ元（前期）</label>
          <select name="sourceFiscalPeriodId" required defaultValue={fiscalPeriods[1]?.id} className={inputClass}>
            {fiscalPeriods.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">引き継ぎ先（今期）</label>
          <select name="targetFiscalPeriodId" required defaultValue={fiscalPeriods[0]?.id} className={inputClass}>
            {fiscalPeriods.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "処理中..." : "前期末の残高を引き継ぐ"}
        </button>
      </div>
      {state.status === "success" ? <p className="text-sm text-green-700">{state.message}</p> : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
