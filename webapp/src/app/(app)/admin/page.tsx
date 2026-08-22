import { redirect } from "next/navigation";
import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import {
  createBusinessAction,
  createFiscalPeriodAction,
  createUserAction,
  addMembershipAction,
} from "./actions";
import RemoveMembershipButton from "./remove-membership-button";

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

export default async function AdminPage() {
  const { business, role } = await requireCurrentBusiness();
  if (role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [fiscalPeriods, memberships, allUsers, businesses] = await Promise.all([
    prisma.fiscalPeriod.findMany({ where: { businessId: business.id }, orderBy: { startDate: "desc" } }),
    prisma.membership.findMany({ where: { businessId: business.id }, include: { user: true } }),
    prisma.user.findMany({ orderBy: { email: "asc" } }),
    prisma.business.findMany({ orderBy: { name: "asc" } }),
  ]);

  const memberUserIds = new Set(memberships.map((m) => m.userId));
  const nonMemberUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">管理設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          事業者・会計期間・社内メンバーを管理します（社外ユーザーの招待はできません）。
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">事業者（テナント）</h2>
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
          {businesses.map((b) => (
            <li key={b.id} className="flex justify-between px-4 py-2">
              <span>{b.name}</span>
              <span className="text-slate-400">{b.code}</span>
            </li>
          ))}
        </ul>
        <form action={createBusinessAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">事業者名</label>
            <input name="name" required className={inputClass} placeholder="例: 〇〇合同会社" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">コード</label>
            <input name="code" required className={inputClass} placeholder="例: example-llc" />
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            新規事業者を作成
          </button>
        </form>
        <p className="text-xs text-slate-400">
          新規事業者を作成すると、作成した自分がその事業者のADMINとして自動的に追加されます。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">{business.name} の会計期間</h2>
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
          {fiscalPeriods.map((fp) => (
            <li key={fp.id} className="flex justify-between px-4 py-2">
              <span>{fp.label}</span>
              <span className="text-slate-400">
                {fp.startDate.toISOString().slice(0, 10)} 〜 {fp.endDate.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
          {fiscalPeriods.length === 0 ? (
            <li className="px-4 py-6 text-center text-slate-400">会計期間はまだありません。</li>
          ) : null}
        </ul>
        <form action={createFiscalPeriodAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">期間名</label>
            <input name="label" required className={inputClass} placeholder="例: 27.02月期" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">開始日</label>
            <input type="date" name="startDate" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">終了日</label>
            <input type="date" name="endDate" required className={inputClass} />
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            会計期間を作成
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">{business.name} のメンバー</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">氏名</th>
                <th className="px-4 py-2">メールアドレス</th>
                <th className="px-4 py-2">権限</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{m.user.name}</td>
                  <td className="px-4 py-2">{m.user.email}</td>
                  <td className="px-4 py-2">{m.role === "ADMIN" ? "管理者" : "メンバー"}</td>
                  <td className="px-4 py-2">
                    <RemoveMembershipButton membershipId={m.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <form action={createUserAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-slate-600">新規社内メンバーを作成</h3>
            <input name="name" required placeholder="氏名" className={inputClass} />
            <input name="email" type="email" required placeholder="メールアドレス" className={inputClass} />
            <input name="password" type="password" required minLength={8} placeholder="初期パスワード（8文字以上）" className={inputClass} />
            <select name="role" className={inputClass} defaultValue="MEMBER">
              <option value="MEMBER">メンバー</option>
              <option value="ADMIN">管理者</option>
            </select>
            <button type="submit" className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              作成してこの事業者に追加
            </button>
          </form>

          <form action={addMembershipAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-slate-600">既存メンバーをこの事業者に追加</h3>
            <select name="userId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                ユーザーを選択
              </option>
              {nonMemberUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}（{u.email}）
                </option>
              ))}
            </select>
            <select name="role" className={inputClass} defaultValue="MEMBER">
              <option value="MEMBER">メンバー</option>
              <option value="ADMIN">管理者</option>
            </select>
            <button type="submit" className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              追加
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
