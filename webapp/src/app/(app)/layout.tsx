import Link from "next/link";
import { requireCurrentBusiness } from "@/lib/business-context";
import { switchBusinessAction, logoutAction } from "@/app/actions/business";
import AutoSubmitSelect from "@/components/auto-submit-select";

const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/opening-balance", label: "期首残高" },
  { href: "/import", label: "データ取込" },
  { href: "/holdings", label: "銘柄別損益" },
  { href: "/valuation", label: "月末時価評価" },
  { href: "/journal", label: "仕訳出力" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, business, role, memberships } = await requireCurrentBusiness();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-slate-900">
              有価証券損益管理
            </span>
            {memberships.length > 1 ? (
              <form action={switchBusinessAction} className="flex items-center gap-2">
                <AutoSubmitSelect
                  name="businessId"
                  defaultValue={business.id}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  {memberships.map((m) => (
                    <option key={m.businessId} value={m.businessId}>
                      {m.business.name}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
            ) : (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
                {business.name}
              </span>
            )}
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="text-slate-600 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
            {role === "ADMIN" ? (
              <Link href="/admin" prefetch={false} className="text-slate-600 hover:text-slate-900">
                管理
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{user.name ?? user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-slate-500 hover:text-slate-900">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
