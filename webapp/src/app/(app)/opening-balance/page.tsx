import { requireCurrentBusiness } from "@/lib/business-context";
import prisma from "@/lib/prisma";
import OpeningBalanceForm from "./opening-balance-form";
import CarryForwardForm from "./carry-forward-form";
import OcrUploadForm from "./ocr-upload-form";
import DeleteButton from "./delete-button";

export default async function OpeningBalancePage() {
  const { business } = await requireCurrentBusiness();

  const fiscalPeriods = await prisma.fiscalPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { startDate: "desc" },
  });

  const balances = await prisma.openingBalance.findMany({
    where: { businessId: business.id },
    include: { security: true, fiscalPeriod: true },
    orderBy: [{ fiscalPeriod: { startDate: "desc" } }, { security: { code: "asc" } }],
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">期首残高</h1>
        <p className="mt-1 text-sm text-slate-500">
          前期末の残高証明書をもとに、期首時点の保有銘柄・株数・帳簿残高を登録してください。
          現物・信用買建・信用売建をそれぞれ個別に入力できます。
        </p>
      </div>

      {fiscalPeriods.length === 0 ? (
        <p className="text-sm text-red-600">先に会計期間を作成してください。</p>
      ) : (
        <>
          <CarryForwardForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
          <OcrUploadForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
          <OpeningBalanceForm fiscalPeriods={fiscalPeriods.map((fp) => ({ id: fp.id, label: fp.label }))} />
        </>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">会計期間</th>
              <th className="px-4 py-2">銘柄</th>
              <th className="px-4 py-2 text-right">現物株数</th>
              <th className="px-4 py-2 text-right">現物取得価額</th>
              <th className="px-4 py-2 text-right">信用買建株数</th>
              <th className="px-4 py-2 text-right">信用売建株数</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{b.fiscalPeriod.label}</td>
                <td className="px-4 py-2">
                  {b.security.code} {b.security.name}
                </td>
                <td className="px-4 py-2 text-right">{b.spotQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{b.spotBookValue.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{b.marginLongQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{b.marginShortQuantity.toLocaleString()}</td>
                <td className="px-4 py-2">
                  <DeleteButton id={b.id} />
                </td>
              </tr>
            ))}
            {balances.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  期首残高はまだ登録されていません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
