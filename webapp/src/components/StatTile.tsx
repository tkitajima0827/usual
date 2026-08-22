import { formatYenCompact } from "@/lib/format";

export function StatTile({
  label,
  amount,
  accent,
}: {
  label: string;
  amount: number;
  accent?: "good" | "critical";
}) {
  const valueColor =
    accent === "good"
      ? "text-[var(--status-good)]"
      : accent === "critical"
        ? "text-[var(--status-critical)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-5 py-4 shadow-sm">
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {formatYenCompact(amount)}
      </div>
    </div>
  );
}
