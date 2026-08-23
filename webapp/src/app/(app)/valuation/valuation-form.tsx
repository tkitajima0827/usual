"use client";

import { useActionState, useState } from "react";
import {
  saveMonthEndPricesAction,
  fetchMonthEndPricesAction,
  type ValuationActionState,
  type FetchPricesActionState,
} from "./actions";

const initialState: ValuationActionState = { status: "idle" };
const initialFetchState: FetchPricesActionState = { status: "idle" };

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
  const [fetchState, fetchAction, fetching] = useActionState(fetchMonthEndPricesAction, initialFetchState);
  const [fetchedPrices, setFetchedPrices] = useState<Map<string, number> | null>(null);

  // useActionStateの結果が変わったタイミングでfetchedPricesを同期する(レンダー中に
  // 更新することでuseEffectを使わずに済ませる。React公式ドキュメント
  // "Adjusting state when a prop changes" のパターン)。
  const [lastFetchState, setLastFetchState] = useState(fetchState);
  if (fetchState !== lastFetchState) {
    setLastFetchState(fetchState);
    if (fetchState.status === "success" && fetchState.prices) {
      setFetchedPrices(new Map(fetchState.prices.map((p) => [p.securityId, p.unitPrice])));
    }
  }

  function priceFor(securityId: string): number | "" {
    const fetched = fetchedPrices?.get(securityId);
    if (fetched != null) return fetched;
    return existingPrices.get(securityId) ?? "";
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={fetchAction} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          disabled={fetching || positions.length === 0}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {fetching ? "取得中..." : "ネットから月末終値を自動取得"}
        </button>
        <p className="text-xs text-slate-500">
          AIが日本取引所グループ(JPX)の「月間相場表」PDFから各銘柄の月末終値を調べて下の欄に自動入力します。
          取得後は必ず内容を確認・修正してから保存してください。
        </p>
        {fetchState.status === "error" ? <p className="w-full text-sm text-red-600">{fetchState.message}</p> : null}
        {fetchState.status === "success" ? (
          <p className="w-full text-sm text-green-700">{fetchState.message}</p>
        ) : null}
      </form>

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
                      key={fetchedPrices?.get(p.securityId) ?? "initial"}
                      type="number"
                      step="0.1"
                      name={`price_${p.securityId}`}
                      defaultValue={priceFor(p.securityId)}
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
    </div>
  );
}
