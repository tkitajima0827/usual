import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import ImportForm from "./import-form";

export default async function ImportPage() {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });

  const recentBatches = await prisma.importBatch.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

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
        <ImportForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">取込履歴</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">取込日時</th>
                <th className="px-4 py-2">対象月</th>
                <th className="px-4 py-2">ファイル名</th>
                <th className="px-4 py-2">件数</th>
              </tr>
            </thead>
            <tbody>
              {recentBatches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{b.createdAt.toLocaleString("ja-JP")}</td>
                  <td className="px-4 py-2">{b.month}</td>
                  <td className="px-4 py-2">{b.fileName}</td>
                  <td className="px-4 py-2">{b.rowCount}</td>
                </tr>
              ))}
              {recentBatches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
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
