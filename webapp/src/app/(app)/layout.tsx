import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/dal";
import { USER_ROLE_LABEL } from "@/lib/labels";
import { logout } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-1)] px-6 py-3">
        <Link href="/" className="text-sm font-semibold">
          予実管理システム
        </Link>
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span>
            {user.name}
            <span className="ml-1 text-xs text-[var(--text-muted)]">（{USER_ROLE_LABEL[user.role] ?? user.role}）</span>
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-[var(--border-hairline)] px-2 py-1 text-xs hover:bg-[var(--page-plane)]"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
