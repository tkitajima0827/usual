"use client";

import { useActionState } from "react";
import { saveMonthEndPricesAction, type ValuationActionState } from "./actions";

const initialState: ValuationActionState = { status: "idle" };

export default function ValuationForm({
  fiscalPeriodId,
  month,
  positions,
  existingPrices,
}: {
  fiscalPeriodId: string;
  month: string;
  positions: { securityId: string; code: string; name: string; quantity: number; bookValue: number }[];
  existingPrices: Map<string, number>;
}) {
  const [state, formAction, pending] = useActionState(saveMonthEndPricesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId} />
      <input type="hidden" name="month" value={month} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">銘柄</th>
              <th className="px-4 py-2 text-right">保有株数</th>
              <th className="px-4 py-2 text-right">帳簿価額</th>
              <th className="px-4 py-2 text-right">月末単価（円）</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.securityId} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {p.code} {p.name}
                </td>
                <td className="px-4 py-2 text-right">{p.quantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{p.bookValue.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    step="0.1"
                    name={`price_${p.securityId}`}
                    defaultValue={existingPrices.get(p.securityId) ?? ""}
                    className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right"
                  />
                </td>
              </tr>
            ))}
            {positions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  この月末時点で保有している現物銘柄はありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {positions.length > 0 ? (
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "計算中..." : "時価を保存して評価損益を計算"}
        </button>
      ) : null}

      {state.status === "success" ? <p className="text-sm text-green-700">{state.message}</p> : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
