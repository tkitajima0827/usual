"use client";

import { useActionState, useState } from "react";
import {
  parseBalanceCertificateAction,
  bulkSaveOpeningBalanceAction,
  type ParseActionState,
  type OpeningBalanceActionState,
} from "./actions";

type Row = {
  code: string;
  name: string;
  spotQuantity: number;
  spotBookValue: number;
  marginLongQuantity: number;
  marginLongBookValue: number;
  marginShortQuantity: number;
  marginShortBookValue: number;
};

const initialParseState: ParseActionState = { status: "idle" };
const initialSaveState: OpeningBalanceActionState = { status: "idle" };

const cellInput = "w-full rounded border border-slate-200 px-1 py-0.5 text-sm";

export default function OcrUploadForm({
  fiscalPeriods,
}: {
  fiscalPeriods: { id: string; label: string }[];
}) {
  const [parseState, parseAction, parsing] = useActionState(parseBalanceCertificateAction, initialParseState);
  const [saveState, saveAction, saving] = useActionState(bulkSaveOpeningBalanceAction, initialSaveState);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fiscalPeriodId, setFiscalPeriodId] = useState(fiscalPeriods[0]?.id ?? "");
  // 読み取り実行時に実際に選ばれていた会計期間(サーバーからのエコーバック値)。保存は
  // 必ずこの値を使う。読み取り後にセレクトの表示が別の期間に戻って見えることがあっても、
  // 保存先はアップロード時点で選んだ期間のまま変わらない。
  const [confirmedFiscalPeriodId, setConfirmedFiscalPeriodId] = useState<string | null>(null);

  // useActionStateの結果が変わったタイミングでrowsを同期する(レンダー中に更新することで
  // useEffectを使わずに済ませ、余分な再レンダーを避けている。React公式ドキュメント
  // "Adjusting state when a prop changes" のパターン)。
  const [lastParseState, setLastParseState] = useState(parseState);
  if (parseState !== lastParseState) {
    setLastParseState(parseState);
    if (parseState.status === "success" && parseState.rows) {
      setRows(parseState.rows);
      setConfirmedFiscalPeriodId(parseState.fiscalPeriodId ?? null);
    }
  }

  const confirmedFiscalPeriodLabel = fiscalPeriods.find((fp) => fp.id === confirmedFiscalPeriodId)?.label;

  const [lastSaveState, setLastSaveState] = useState(saveState);
  if (saveState !== lastSaveState) {
    setLastSaveState(saveState);
    if (saveState.status === "success") {
      setRows(null);
      setConfirmedFiscalPeriodId(null);
    }
  }

  function updateRow(index: number, key: keyof Row, value: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const isText = key === "code" || key === "name";
      next[index] = { ...next[index], [key]: isText ? value : Number(value) || 0 };
      return next;
    });
  }

  function removeRow(index: number) {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">残高証明書をアップロードして自動入力（AI）</h3>
        <p className="mt-1 text-xs text-slate-500">
          証券会社発行の残高証明書（PDFまたは画像）をアップロードすると、AIが内容を読み取り下の表に自動入力します。
          読み取り精度は完全ではないため、保存前に必ず内容を確認・修正してください。
        </p>
      </div>

      <form action={parseAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">会計期間（保存先）</label>
          <select
            name="fiscalPeriodId"
            value={fiscalPeriodId}
            onChange={(e) => setFiscalPeriodId(e.target.value)}
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
          <label className="text-xs text-slate-500">残高証明書（PDF/画像）</label>
          <input
            name="file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={parsing}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {parsing ? "読み取り中..." : "AIで読み取る"}
        </button>
      </form>

      {parseState.status === "error" ? <p className="text-sm text-red-600">{parseState.message}</p> : null}

      {rows && rows.length > 0 && confirmedFiscalPeriodId ? (
        <form action={saveAction} className="flex flex-col gap-3">
          <input type="hidden" name="fiscalPeriodId" value={confirmedFiscalPeriodId} />
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <p className="text-sm text-slate-600">
            読み取り結果です。内容を確認・修正してから保存してください。保存先:{" "}
            <span className="font-semibold text-slate-900">{confirmedFiscalPeriodLabel ?? "(不明な会計期間)"}</span>
          </p>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-1">コード</th>
                  <th className="px-2 py-1">銘柄名</th>
                  <th className="px-2 py-1 text-right">現物株数</th>
                  <th className="px-2 py-1 text-right">現物取得価額</th>
                  <th className="px-2 py-1 text-right">信用買建株数</th>
                  <th className="px-2 py-1 text-right">信用買建取得価額</th>
                  <th className="px-2 py-1 text-right">信用売建株数</th>
                  <th className="px-2 py-1 text-right">信用売建代金</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">
                      <input value={r.code} onChange={(e) => updateRow(i, "code", e.target.value)} className={cellInput} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} className={cellInput} />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.spotQuantity}
                        onChange={(e) => updateRow(i, "spotQuantity", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.spotBookValue}
                        onChange={(e) => updateRow(i, "spotBookValue", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.marginLongQuantity}
                        onChange={(e) => updateRow(i, "marginLongQuantity", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.marginLongBookValue}
                        onChange={(e) => updateRow(i, "marginLongBookValue", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.marginShortQuantity}
                        onChange={(e) => updateRow(i, "marginShortQuantity", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={r.marginShortBookValue}
                        onChange={(e) => updateRow(i, "marginShortBookValue", e.target.value)}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-600 hover:underline">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "この内容で保存"}
          </button>
          {saveState.status === "error" ? <p className="text-sm text-red-600">{saveState.message}</p> : null}
        </form>
      ) : null}

      {saveState.status === "success" ? <p className="text-sm text-green-700">{saveState.message}</p> : null}
    </div>
  );
}
