import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import ImportForm from "./import-form";
import DeleteBatchButton from "./delete-batch-button";
import RecomputeForm from "./recompute-form";
import HistoryLimitSelect from "./history-limit-select";

const LIMIT_OPTIONS = ["10", "20", "50", "all"] as const;

export default async function ImportPage(props: PageProps<"/import">) {
  const { business } = await requireCurrentBusiness();
  const searchParams = await props.searchParams;

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });

  const limitParam = typeof searchParams.limit === "string" ? searchParams.limit : "10";
  const limit = LIMIT_OPTIONS.includes(limitParam as (typeof LIMIT_OPTIONS)[number]) ? limitParam : "10";

  const recentBatches = await prisma.importBatch.findMany({
    where: { businessId: business.id },
    include: { fiscalPeriod: true },
    orderBy: { createdAt: "desc" },
    ...(limit === "all" ? {} : { take: Number(limit) }),
  });

  // 同じ会計期間・同じ対象月の取込が複数あると、多くの場合は重複取込(または
  // 取込のやり直し忘れ)なので、目立つように印を付ける。
  const duplicateKeyCounts = new Map<string, number>();
  for (const b of recentBatches) {
    const key = `${b.fiscalPeriodId}:${b.month}`;
    duplicateKeyCounts.set(key, (duplicateKeyCounts.get(key) ?? 0) + 1);
  }
  const isLikelyDuplicate = (b: (typeof recentBatches)[number]) =>
    (duplicateKeyCounts.get(`${b.fiscalPeriodId}:${b.month}`) ?? 0) > 1;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">データ取込</h1>
        <p className="mt-1 text-sm text-slate-500">
          SBI証券の「約定履歴照会」からダウンロードした元データ（月次）をアップロードしてください。
          取り込むと自動で移動平均法による原価計算・実現損益計算・仕訳作成が行われます。
        </p>
      </div>

      {fiscalPeriods.length === 0 ? (
        <p className="text-sm text-red-600">
          会計期間が登録されていません。先に管理画面で会計期間を作成してください。
        </p>
      ) : (
        <>
          <ImportForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
          <RecomputeForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
        </>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">取込履歴</h2>
          <HistoryLimitSelect value={limit} />
        </div>
        <p className="mb-2 text-xs text-slate-500">
          同じ会計期間・同じ対象月の取込が複数ある行には「重複の可能性」と表示されます。誤って同じ月を
          2回取り込んでいないか確認し、不要な方を削除してください。
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">取込日時</th>
                <th className="px-4 py-2">会計期間</th>
                <th className="px-4 py-2">対象月</th>
                <th className="px-4 py-2">ファイル名</th>
                <th className="px-4 py-2">件数</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recentBatches.map((b) => (
                <tr
                  key={b.id}
                  className={`border-t border-slate-100 ${isLikelyDuplicate(b) ? "bg-amber-50" : ""}`}
                >
                  <td className="px-4 py-2">{b.createdAt.toLocaleString("ja-JP")}</td>
                  <td className="px-4 py-2">
                    {b.fiscalPeriod.label}
                    {isLikelyDuplicate(b) ? (
                      <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                        重複の可能性
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{b.month}</td>
                  <td className="px-4 py-2">{b.fileName}</td>
                  <td className="px-4 py-2">{b.rowCount}</td>
                  <td className="px-4 py-2">
                    <DeleteBatchButton id={b.id} fileName={b.fileName} />
                  </td>
                </tr>
              ))}
              {recentBatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    取込履歴はありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
