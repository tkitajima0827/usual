import Link from "next/link";
import { getClients } from "@/lib/queries";

export default async function HomePage() {
  const clients = await getClients();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold">予実管理システム</h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        顧客ごとの単年度計画・中期経営計画を作成し、予実管理を行います。
      </p>

      <div className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        {clients.length === 0 && (
          <p className="px-5 py-6 text-[var(--text-secondary)]">
            顧客データがまだありません。<code>npm run db:seed</code> でテストデータを投入してください。
          </p>
        )}
        <ul className="divide-y divide-[var(--gridline)]">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-[var(--page-plane)]"
              >
                <div>
                  <div className="font-medium">{client.name}</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    期首月: {client.fiscalYearStartMonth}月 / {client.taxMethod === "INCLUSIVE" ? "税込経理" : "税抜経理"}
                  </div>
                </div>
                <span className="text-[var(--text-muted)]">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
