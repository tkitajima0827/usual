"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface TrendPoint {
  month: string;
  bookValue: number;
  marketValue: number | null;
  monthlyValuationGain: number | null;
  cumulativeValuationGain: number | null;
  monthlyRealizedGain: number;
  cumulativeRealizedGain: number;
}

// このコンポーネントはクライアント側で実行されるため、toLocaleString()に
// ロケールを渡さないと閲覧者のブラウザ設定(例: 3桁区切りではないロケール)に
// 依存してしまう。常に日本式の3桁区切りで表示するため"ja-JP"を明示する。
const numberFormatter = (v: number) => v.toLocaleString("ja-JP");
const tooltipFormatter = (v: unknown) => (v === undefined || v === null ? "-" : Number(v).toLocaleString("ja-JP"));

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-600">現物帳簿価額・時価評価額</h3>
        <div className="h-72 w-full rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={numberFormatter} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Line type="monotone" dataKey="bookValue" name="現物帳簿価額" stroke="#2a78d6" strokeWidth={2} dot={false} />
              <Line
                type="monotone"
                dataKey="marketValue"
                name="時価評価額"
                stroke="#eb6834"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-600">評価損益・売買損益</h3>
        <div className="h-72 w-full rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={numberFormatter} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Bar dataKey="monthlyValuationGain" name="単月評価損益" fill="#1baf7a" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="monthlyRealizedGain" name="単月売買損益" fill="#e87ba4" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Line
                type="monotone"
                dataKey="cumulativeValuationGain"
                name="累計評価損益"
                stroke="#eda100"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="cumulativeRealizedGain"
                name="累計売買損益"
                stroke="#008300"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
