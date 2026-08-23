"use client";

import { useState, useTransition } from "react";
import {
  createCounterparty,
  deleteCounterparty,
  updateCounterparty,
  updateDefaultSettlementTerm,
} from "@/lib/actions/settlementTerms";
import type { SettlementSettingsViewModel } from "@/lib/queries";
import type { SettlementDirection } from "@/generated/prisma/client";

const inputClass =
  "rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-0.5 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]";

function describeTerm(closingDay: number, monthsAfter: number, settlementDay: number): string {
  const closing = closingDay >= 31 ? "末" : `${closingDay}日`;
  const after = monthsAfter === 0 ? "当月" : monthsAfter === 1 ? "翌月" : `${monthsAfter}ヶ月後`;
  const day = settlementDay >= 31 ? "末日" : `${settlementDay}日`;
  return `${closing}締め ${after}${day}`;
}

function TermFields({
  closingDay,
  monthsAfter,
  settlementDay,
  onChange,
}: {
  closingDay: number;
  monthsAfter: number;
  settlementDay: number;
  onChange: (next: { closingDay: number; monthsAfter: number; settlementDay: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
      <label className="flex items-center gap-1">
        締め日
        <input
          type="number"
          min={1}
          max={31}
          className={inputClass}
          value={closingDay}
          onChange={(e) => onChange({ closingDay: Number(e.target.value), monthsAfter, settlementDay })}
        />
      </label>
      <label className="flex items-center gap-1">
        何ヶ月後
        <input
          type="number"
          min={0}
          max={12}
          className={inputClass}
          value={monthsAfter}
          onChange={(e) => onChange({ closingDay, monthsAfter: Number(e.target.value), settlementDay })}
        />
      </label>
      <label className="flex items-center gap-1">
        回収/支払日
        <input
          type="number"
          min={1}
          max={31}
          className={inputClass}
          value={settlementDay}
          onChange={(e) => onChange({ closingDay, monthsAfter, settlementDay: Number(e.target.value) })}
        />
      </label>
      <span className="text-[var(--text-muted)]">（31＝月末）</span>
    </div>
  );
}

function DefaultTermRow({
  clientId,
  direction,
  label,
  term,
}: {
  clientId: string;
  direction: SettlementDirection;
  label: string;
  term: { closingDay: number; monthsAfter: number; settlementDay: number };
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(term);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateDefaultSettlementTerm({ clientId, direction, ...draft });
      if (result.ok) setEditing(false);
      else setError(result.error ?? "保存に失敗しました");
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(term);
              setEditing(true);
            }}
            className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
          >
            編集
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <TermFields {...draft} onChange={setDraft} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded bg-[var(--series-1)] px-2 py-0.5 text-[11px] text-white disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px]"
            >
              キャンセル
            </button>
            {error && <span className="text-[11px] text-[var(--status-critical)]">{error}</span>}
          </div>
        </div>
      ) : (
        <div className="text-sm font-semibold tabular-nums">
          {describeTerm(term.closingDay, term.monthsAfter, term.settlementDay)}
        </div>
      )}
    </div>
  );
}

const DIRECTION_LABEL: Record<SettlementDirection, string> = {
  RECEIVABLE: "売掛金（回収）",
  PAYABLE: "買掛金（支払）",
};

function CounterpartyForm({
  clientId,
  accountOptions,
  initial,
  onDone,
}: {
  clientId: string;
  accountOptions: SettlementSettingsViewModel["accountOptions"];
  initial?: SettlementSettingsViewModel["counterparties"][number];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [direction, setDirection] = useState<SettlementDirection>(initial?.direction ?? "RECEIVABLE");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [term, setTerm] = useState({
    closingDay: initial?.closingDay ?? 31,
    monthsAfter: initial?.monthsAfter ?? 1,
    settlementDay: initial?.settlementDay ?? 31,
  });

  function save() {
    setError(null);
    startTransition(async () => {
      const input = { clientId, name, direction, accountId: accountId || null, ...term };
      const result = initial
        ? await updateCounterparty({ id: initial.id, ...input })
        : await createCounterparty(input);
      if (result.ok) onDone();
      else setError(result.error ?? "保存に失敗しました");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="相手先名"
          className={`${inputClass} w-40`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={inputClass}
          style={{ width: "auto" }}
          value={direction}
          onChange={(e) => setDirection(e.target.value as SettlementDirection)}
        >
          <option value="RECEIVABLE">売掛金（回収）</option>
          <option value="PAYABLE">買掛金（支払）</option>
        </select>
        <select
          className={inputClass}
          style={{ width: "auto" }}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">科目を選択（任意）</option>
          {accountOptions
            .filter((a) => a.direction === direction)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </div>
      <TermFields {...term} onChange={setTerm} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-[var(--series-1)] px-2 py-0.5 text-[11px] text-white disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px]"
        >
          キャンセル
        </button>
        {error && <span className="text-[11px] text-[var(--status-critical)]">{error}</span>}
      </div>
    </div>
  );
}

function CounterpartyRow({
  clientId,
  accountOptions,
  counterparty,
}: {
  clientId: string;
  accountOptions: SettlementSettingsViewModel["accountOptions"];
  counterparty: SettlementSettingsViewModel["counterparties"][number];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await deleteCounterparty({ clientId, id: counterparty.id });
    });
  }

  if (editing) {
    return (
      <CounterpartyForm
        clientId={clientId}
        accountOptions={accountOptions}
        initial={counterparty}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm">
      <div>
        <span className="font-medium">{counterparty.name}</span>
        <span className="ml-2 text-xs text-[var(--text-muted)]">
          {DIRECTION_LABEL[counterparty.direction]}
          {counterparty.accountName ? ` ・ ${counterparty.accountName}` : ""}
        </span>
        <div className="text-xs text-[var(--text-secondary)]">
          {describeTerm(counterparty.closingDay, counterparty.monthsAfter, counterparty.settlementDay)}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
        >
          編集
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] text-[var(--status-critical)] hover:bg-[var(--page-plane)] disabled:opacity-50"
        >
          削除
        </button>
      </div>
    </div>
  );
}

export function SettlementSettingsCard({ data }: { data: SettlementSettingsViewModel }) {
  const [addingCounterparty, setAddingCounterparty] = useState(false);

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">回収・支払サイト設定</h2>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        既定サイトは事業者共通で、売上高科目には回収サイト、売上原価科目には支払サイトが適用される。
        標準に当てはまらない科目は各科目の「編集」から個別のサイトを設定できる。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DefaultTermRow
          clientId={data.client.id}
          direction="RECEIVABLE"
          label="既定の回収サイト（売上高）"
          term={data.defaultTerms.receivable}
        />
        <DefaultTermRow
          clientId={data.client.id}
          direction="PAYABLE"
          label="既定の支払サイト（売上原価）"
          term={data.defaultTerms.payable}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">
            相手先ごとの個別サイト（標準に当てはまらない相手先のみ登録）
          </h3>
          {!addingCounterparty && (
            <button
              type="button"
              onClick={() => setAddingCounterparty(true)}
              className="rounded border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
            >
              ＋ 相手先を追加
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {addingCounterparty && (
            <CounterpartyForm
              clientId={data.client.id}
              accountOptions={data.accountOptions}
              onDone={() => setAddingCounterparty(false)}
            />
          )}
          {data.counterparties.length === 0 && !addingCounterparty && (
            <p className="text-xs text-[var(--text-muted)]">登録済みの相手先はありません。</p>
          )}
          {data.counterparties.map((c) => (
            <CounterpartyRow key={c.id} clientId={data.client.id} accountOptions={data.accountOptions} counterparty={c} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          ※ 現状は相手先ごとの取引実績データを取り込む仕組みが無いため、この個別サイトは登録・参照のみで、
          下記の月次入出金予定の計算にはまだ反映されません（将来、相手先別の実績連携に対応した際に組み込み予定）。
        </p>
      </div>
    </div>
  );
}
