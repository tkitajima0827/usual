import { formatYen, MONTH_LABELS } from "@/lib/format";
import type { CashScheduleViewModel, PlanViewModel } from "@/lib/queries";

function describeTerm(closingDay: number, monthsAfter: number, settlementDay: number): string {
  const closing = closingDay >= 31 ? "末" : `${closingDay}日`;
  const after = monthsAfter === 0 ? "当月" : monthsAfter === 1 ? "翌月" : `${monthsAfter}ヶ月後`;
  const day = settlementDay >= 31 ? "末日" : `${settlementDay}日`;
  return `${closing}締め ${after}${day}`;
}

export function CashScheduleCard({
  data,
  monthLabels,
}: {
  data: CashScheduleViewModel;
  monthLabels: PlanViewModel["monthLabels"];
}) {
  const totalCollections = data.collections.reduce((a, b) => a + b, 0);
  const totalPayments = data.payments.reduce((a, b) => a + b, 0);
  const totalNet = data.net.reduce((a, b) => a + b, 0);

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">月次入出金予定（売上高・売上原価の回収/支払サイト反映）</h2>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        既定サイト: 回収 {describeTerm(data.defaultTerms.receivable.closingDay, data.defaultTerms.receivable.monthsAfter, data.defaultTerms.receivable.settlementDay)}
        {" ／ "}
        支払 {describeTerm(data.defaultTerms.payable.closingDay, data.defaultTerms.payable.monthsAfter, data.defaultTerms.payable.settlementDay)}
        （科目ごとの個別サイトは各科目の「編集」から設定可能）
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-[var(--text-secondary)]">
              <th className="min-w-[100px] px-3 py-2 font-medium">区分</th>
              {monthLabels.map((m) => (
                <th key={`${m.year}-${m.month}`} className="min-w-[86px] px-3 py-2 text-right font-medium">
                  {m.year}/{MONTH_LABELS[m.month - 1]}
                </th>
              ))}
              <th className="min-w-[110px] px-3 py-2 text-right font-medium">年間合計</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--gridline)]">
              <td className="px-3 py-2 font-medium">入金予定</td>
              {data.collections.map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatYen(v)}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                {formatYen(totalCollections)}
              </td>
            </tr>
            <tr className="border-b border-[var(--gridline)]">
              <td className="px-3 py-2 font-medium">支払予定</td>
              {data.payments.map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  -{formatYen(v)}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                -{formatYen(totalPayments)}
              </td>
            </tr>
            <tr className="bg-[var(--page-plane)]">
              <td className="px-3 py-2 font-semibold">差引</td>
              {data.net.map((v, i) => (
                <td
                  key={i}
                  className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${v < 0 ? "text-[var(--status-critical)]" : ""}`}
                >
                  {formatYen(v)}
                </td>
              ))}
              <td
                className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${totalNet < 0 ? "text-[var(--status-critical)]" : ""}`}
              >
                {formatYen(totalNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        売上高・売上原価の計画額を回収/支払サイトに従ってシフトした簡易試算です。売掛金・買掛金の残高そのものや、
        人件費・固定費等の資金繰りは含みません。年度末近くに発生し翌年度にシフトされる分はこの表には含まれません。
      </p>
    </div>
  );
}
