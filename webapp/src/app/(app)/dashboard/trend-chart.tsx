"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
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
  realizedGainCumulative: number;
}

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-80 w-full rounded-lg border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip formatter={(v) => (v === undefined ? v : Number(v).toLocaleString())} />
          <Legend />
          <Line type="monotone" dataKey="bookValue" name="現物帳簿価額" stroke="#0f172a" strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="marketValue"
            name="時価評価額"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="realizedGainCumulative"
            name="累積実現損益"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
