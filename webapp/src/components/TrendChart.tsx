"use client";

import { useId, useState } from "react";
import { formatYenCompact } from "@/lib/format";

export interface TrendChartPoint {
  label: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 16 };

export function TrendChart({ points }: { points: TrendChartPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId();

  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const xFor = (i: number) =>
    PADDING.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotWidth);
  const yFor = (v: number) => PADDING.top + plotHeight - ((v - min) / (max - min || 1)) * plotHeight;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${xFor(points.length - 1).toFixed(1)},${(PADDING.top + plotHeight).toFixed(1)} L${xFor(0).toFixed(1)},${(PADDING.top + plotHeight).toFixed(1)} Z`;

  const zeroY = yFor(0);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="月次売上高計画の推移"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 目盛り線 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PADDING.top + plotHeight * t;
          return (
            <line
              key={t}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          );
        })}

        {min < 0 && (
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        )}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.label}>
            {/* ヒット領域（見えないが8px以上のタップ領域を確保） */}
            <rect
              x={xFor(i) - plotWidth / points.length / 2}
              y={PADDING.top}
              width={plotWidth / points.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
            <circle
              cx={xFor(i)}
              cy={yFor(p.value)}
              r={hoverIndex === i ? 5 : 3}
              fill="var(--surface-1)"
              stroke="var(--series-1)"
              strokeWidth={2}
            />
            <text
              x={xFor(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {p.label}
            </text>
          </g>
        ))}

        {hoverIndex != null && (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
            stroke="var(--baseline)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
      </svg>

      {hovered && hoverIndex != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(xFor(hoverIndex) / WIDTH) * 100}%`,
            top: `${(yFor(hovered.value) / HEIGHT) * 100}%`,
          }}
        >
          <div className="text-[var(--text-secondary)]">{hovered.label}</div>
          <div className="font-semibold tabular-nums">{formatYenCompact(hovered.value)}</div>
        </div>
      )}
    </div>
  );
}
