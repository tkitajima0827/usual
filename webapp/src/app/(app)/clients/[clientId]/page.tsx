import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getFiscalYears, getSettlementSettings } from "@/lib/queries";
import { SettlementSettingsCard } from "@/components/SettlementSettingsCard";
import { isFirmRole, requireClientAccess } from "@/lib/auth/dal";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const session = await requireClientAccess(clientId);
  const client = await getClient(clientId).catch(() => null);
  if (!client) notFound();

  const fiscalYears = await getFiscalYears(clientId);
  const settlementSettings = await getSettlementSettings(clientId);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      {isFirmRole(session.role) && (
        <Link href="/" className="text-sm text-[var(--text-secondary)] hover:underline">
          &larr; 顧客一覧
        </Link>
      )}
      <h1 className="mt-2 text-2xl font-semibold">{client.name}</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        期首月: {client.fiscalYearStartMonth}月 / {client.taxMethod === "INCLUSIVE" ? "税込経理" : "税抜経理"}
      </p>

      <h2 className="mt-8 text-lg font-medium">単年度計画</h2>
      <div className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <ul className="divide-y divide-[var(--gridline)]">
          {fiscalYears.map((fy) => (
            <li key={fy.id}>
              <Link
                href={`/clients/${clientId}/plans/${fy.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-[var(--page-plane)]"
              >
                <div>{fy.label}</div>
                <span className="text-[var(--text-muted)]">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <SettlementSettingsCard data={settlementSettings} />

      <div className="mt-8 rounded-xl border border-dashed border-[var(--border-hairline)] px-5 py-4 text-sm text-[var(--text-secondary)]">
        中期経営計画（5年分のBS/PL/CF連動）、複数顧客の集計ダッシュボードは次フェーズで実装予定です。
      </div>
    </div>
  );
}
