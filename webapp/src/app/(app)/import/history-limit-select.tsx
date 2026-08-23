"use client";

import AutoSubmitSelect from "@/components/auto-submit-select";

export default function HistoryLimitSelect({ value }: { value: string }) {
  return (
    <form method="get" className="flex items-center gap-2 text-xs text-slate-500">
      <label htmlFor="limit">表示件数</label>
      <AutoSubmitSelect
        name="limit"
        defaultValue={value}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
      >
        <option value="10">10件</option>
        <option value="20">20件</option>
        <option value="50">50件</option>
        <option value="all">すべて</option>
      </AutoSubmitSelect>
    </form>
  );
}
