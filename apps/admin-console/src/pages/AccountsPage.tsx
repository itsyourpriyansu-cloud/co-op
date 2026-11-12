// G2 (D-112): the society's own accounts. Vouchers for office income and expenses, the chart of
// accounts with the Accountant's sub-heads, and the year end (annual interest, close, dividend).
// The statements themselves (day book, trial balance, P&L, balance sheet…) are under Reports.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2Type, ModalV2, SingleSelectV2, TabsV2, TabsV2List, TabsV2Trigger, TabsV2Variant, TextInputV2 } from '@juspay/blend-design-system';
import { Plus, Printer } from 'lucide-react';
import { isApiError, newIdempotencyKey } from '@tgs/api-client';
import { formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { LedgerHead, OfficeVoucherInput } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { Chips } from '@/components/Chips';
import { MoneyField, NumberField, TextField, fieldErrorsOf } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { api } from '@/lib/api';

type Tab = 'vouchers' | 'heads' | 'year-end';
const TABS: Array<[Tab, string]> = [
  ['vouchers', 'Vouchers'],
  ['heads', 'Chart of accounts'],
  ['year-end', 'Year end'],
];
const TYPE_LABEL: Record<LedgerHead['type'], string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Capital and reserves', INCOME: 'Income', EXPENSE: 'Expenses' };

export function AccountsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'vouchers') as Tab;
  return (
    <>
      <PageHeader title="Accounts" description="Office income and expenses, the chart of accounts and the year end. Statements are under Reports → Cash & Accounts." />
      <TabsV2 value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsV2List variant={TabsV2Variant.UNDERLINE}>
          {TABS.map(([v, label]) => (
            <TabsV2Trigger key={v} value={v} variant={TabsV2Variant.UNDERLINE}>
              {label}
            </TabsV2Trigger>
          ))}
        </TabsV2List>
      </TabsV2>
      <div className="mt-5">{tab === 'vouchers' ? <Vouchers /> : tab === 'heads' ? <Heads /> : <YearEnd />}</div>
    </>
  );
}

// ---- Vouchers -------------------------------------------------------------------------------

function Vouchers() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<'' | 'PAYMENT' | 'RECEIPT'>('');
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['vouchers', page, kind], queryFn: () => api.accounts.vouchers({ page, pageSize: 50, ...(kind ? { kind } : {}) }), placeholderData: keepPreviousData });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips
          label="Show"
          value={kind}
          options={[
            { value: '', label: 'All' },
            { value: 'PAYMENT', label: 'Payments' },
            { value: 'RECEIPT', label: 'Receipts' },
          ]}
          onChange={(v) => (setKind(v as typeof kind), setPage(1))}
        />
        {can('ledger.post') && <ButtonV2 text="New voucher" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => setOpen(true)} />}
      </div>
      {list.isError ? (
        <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't load vouchers" description="Check your connection and try again." />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-left text-body">
            <thead className="border-b border-line bg-surface-subtle text-caption-strong text-fg-secondary">
              <tr>
                <th className="px-4 py-2.5">Voucher</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Head</th>
                <th className="px-4 py-2.5">Paid to / received from</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {!d ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-caption text-fg-tertiary">
                    Loading…
                  </td>
                </tr>
              ) : d.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-caption text-fg-tertiary">
                    {kind ? 'No vouchers of this kind.' : 'No vouchers yet. Office expenses and other income are entered here.'}
                  </td>
                </tr>
              ) : (
                d.items.map((v) => (
                  <tr key={v.id} className={v.reversed ? 'text-fg-tertiary line-through' : undefined}>
                    <td className="px-4 py-2.5 tabular text-label">{v.voucherNo}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-caption">{formatDisplayDate(v.date)}</td>
                    <td className="px-4 py-2.5">{v.headName}</td>
                    <td className="px-4 py-2.5">
                      {v.party}
                      <span className="block text-caption text-fg-tertiary">{v.narration}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular ${v.kind === 'PAYMENT' ? '' : 'text-success-fg'}`}>
                      {v.kind === 'PAYMENT' ? '−' : '+'}
                      {formatINR(v.amount)}
                      <span className="block text-caption text-fg-tertiary">{v.mode === 'CASH' ? 'Cash' : `Bank · ${v.reference ?? ''}`}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ButtonV2 text="Print" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Printer size={14} /> }} onClick={() => navigate(`/reports/print/office-voucher?id=${v.id}`)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {d && d.total > d.pageSize && (
            <footer className="flex items-center justify-between border-t border-line-subtle px-4 py-3 text-caption text-fg-secondary">
              <span>
                {d.total} vouchers · page {page} of {pages}
              </span>
              <span className="flex gap-2">
                <ButtonV2 text="Newer" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} disabled={page <= 1} onClick={() => setPage(page - 1)} />
                <ButtonV2 text="Older" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} disabled={page >= pages} onClick={() => setPage(page + 1)} />
              </span>
            </footer>
          )}
        </section>
      )}
      {open && <VoucherForm onClose={() => setOpen(false)} />}
    </div>
  );
}

function VoucherForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const heads = useQuery({ queryKey: ['ledger-heads'], queryFn: api.accounts.heads });
  const [v, setV] = useState<OfficeVoucherInput>({ kind: 'PAYMENT', headCode: '', amount: 0, mode: 'CASH', party: '', narration: '' });
  const [idemKey] = useState(newIdempotencyKey);
  const set = (p: Partial<OfficeVoucherInput>) => setV({ ...v, ...p });
  const save = useMutation({
    mutationFn: () => api.accounts.createVoucher({ ...v, ...(v.mode === 'BANK' ? {} : { reference: undefined }) }, idemKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vouchers'] });
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);
  const options = (heads.data ?? []).filter((h) => h.active && h.type === (v.kind === 'PAYMENT' ? 'EXPENSE' : 'INCOME'));
  return (
    <ModalV2
      isOpen
      onClose={onClose}
      title="New voucher"
      subtitle="One entry in the books: the head against cash or bank."
      primaryAction={{ text: v.kind === 'PAYMENT' ? 'Save payment' : 'Save receipt', onClick: () => save.mutate(), loading: save.isPending }}
      secondaryAction={{ text: 'Cancel', onClick: onClose }}
    >
      <div className="flex flex-col gap-4">
        <Chips
          label="Kind"
          value={v.kind}
          options={[
            { value: 'PAYMENT', label: 'Payment (expense)' },
            { value: 'RECEIPT', label: 'Receipt (other income)' },
          ]}
          onChange={(k) => set({ kind: k as OfficeVoucherInput['kind'], headCode: '' })}
        />
        <SingleSelectV2
          label={v.kind === 'PAYMENT' ? 'Expense head' : 'Income head'}
          placeholder="Choose"
          items={[{ items: options.map((h) => ({ label: `${h.code} ${h.name}`, value: h.code })) }]}
          selected={v.headCode}
          onSelect={(x) => set({ headCode: x })}
          {...(errors.headCode ? { error: { show: true, message: errors.headCode } } : {})}
        />
        <MoneyField label="Amount" name="amount" value={v.amount} onChange={(amount) => set({ amount })} errors={errors} required />
        <Chips
          label="Paid by"
          value={v.mode}
          options={[
            { value: 'CASH', label: 'Cash' },
            { value: 'BANK', label: 'Bank' },
          ]}
          onChange={(m) => set({ mode: m as OfficeVoucherInput['mode'] })}
        />
        {v.mode === 'BANK' && <TextField label="Cheque or transfer reference" name="reference" value={v.reference ?? ''} onChange={(reference) => set({ reference })} errors={errors} required />}
        <TextField label={v.kind === 'PAYMENT' ? 'Paid to' : 'Received from'} name="party" value={v.party} onChange={(party) => set({ party })} errors={errors} required />
        <TextField label="What it is for" name="narration" value={v.narration} onChange={(narration) => set({ narration })} errors={errors} required placeholder="e.g. Stationery for October" />
        <TextInputV2 label="Date" type="date" value={v.date ?? ''} onChange={(e) => set({ date: e.target.value || undefined })} hintText="Leave empty for today" {...(errors.date ? { error: { show: true, message: errors.date } } : {})} />
        {save.error && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}
      </div>
    </ModalV2>
  );
}

// ---- Chart of accounts ----------------------------------------------------------------------

function Heads() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const heads = useQuery({ queryKey: ['ledger-heads'], queryFn: api.accounts.heads });
  const [parent, setParent] = useState<LedgerHead>();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.accounts.addHead({ parentCode: parent!.code, name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ledger-heads'] });
      setParent(undefined);
      setName('');
    },
  });
  const toggle = useMutation({ mutationFn: (h: LedgerHead) => api.accounts.updateHead(h.code, { active: !h.active }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['ledger-heads'] }) });
  const all = heads.data ?? [];
  const editable = can('ledger.post');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(Object.keys(TYPE_LABEL) as Array<LedgerHead['type']>).map((t) => (
        <Panel key={t} title={TYPE_LABEL[t]} flush>
          <ul className="divide-y divide-line-subtle">
            {all
              .filter((h) => h.type === t && !h.parentCode)
              .map((h) => (
                <li key={h.code} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body text-fg">
                      <span className="tabular text-fg-tertiary">{h.code}</span> {h.name}
                      {h.memberLevel && <span className="ml-2 text-caption text-fg-tertiary">per member</span>}
                    </span>
                    {editable && (t === 'INCOME' || t === 'EXPENSE') && <ButtonV2 text="Add sub-head" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} onClick={() => setParent(h)} />}
                  </div>
                  {all
                    .filter((c) => c.parentCode === h.code)
                    .map((c) => (
                      <div key={c.code} className="mt-1.5 flex items-center justify-between gap-3 pl-6 text-caption">
                        <span className={c.active ? 'text-fg-secondary' : 'text-fg-tertiary line-through'}>
                          <span className="tabular">{c.code}</span> {c.name}
                        </span>
                        {editable && <ButtonV2 text={c.active ? 'Close' : 'Reopen'} size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} onClick={() => toggle.mutate(c)} />}
                      </div>
                    ))}
                </li>
              ))}
          </ul>
        </Panel>
      ))}
      {parent && (
        <ModalV2 isOpen onClose={() => setParent(undefined)} title={`Sub-head under ${parent.name}`} subtitle="Vouchers can then use it; it adds up into its main head in the statements." primaryAction={{ text: 'Add', onClick: () => add.mutate(), loading: add.isPending }} secondaryAction={{ text: 'Cancel', onClick: () => setParent(undefined) }}>
          <TextField label="Name" name="name" value={name} onChange={setName} errors={fieldErrorsOf(add.error)} placeholder="e.g. Electricity" required />
        </ModalV2>
      )}
    </div>
  );
}

// ---- Year end -------------------------------------------------------------------------------

function YearEnd() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [fy, setFy] = useState<string>();
  const status = useQuery({ queryKey: ['year-end', fy], queryFn: () => api.accounts.yearEnd(fy) });
  const s = status.data;
  const year = fy ?? s?.fy ?? '';
  const interest = useQuery({ queryKey: ['year-interest', year], queryFn: () => api.accounts.interestPreview(year), enabled: Boolean(year) });
  const [rate, setRate] = useState(0);
  const [resolution, setResolution] = useState('');
  const dividend = useQuery({ queryKey: ['year-dividend', year, rate], queryFn: () => api.accounts.dividendPreview(year, rate), enabled: Boolean(year && s?.closed), placeholderData: keepPreviousData });
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('year-') });
  const [confirm, setConfirm] = useState<'interest' | 'close' | 'declare' | 'pay'>();
  const act = useMutation({
    mutationFn: async (what: 'interest' | 'close' | 'declare' | 'pay') =>
      what === 'interest' ? api.accounts.postInterest(year) : what === 'close' ? api.accounts.closeYear(year) : what === 'declare' ? api.accounts.declareDividend({ fy: year, ratePercent: rate, resolution }) : api.accounts.payDividend(year),
    onSuccess: () => (setConfirm(undefined), refresh()),
  });
  const canClose = can('ledger.close');
  if (!s) return <p className="text-caption text-fg-tertiary">{status.isError ? "Couldn't load the year." : 'Loading…'}</p>;
  const ip = interest.data;
  const dp = dividend.data;
  const actErrors = fieldErrorsOf(act.error);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44">
          <SingleSelectV2 label="Financial year" placeholder="Choose" items={[{ items: s.years.map((y) => ({ label: y, value: y })) }]} selected={year} onSelect={(y) => setFy(y)} />
        </div>
        <p className="text-caption text-fg-secondary">
          {formatDisplayDate(s.from)} – {formatDisplayDate(s.to)} · {s.closed ? `closed by ${s.closed.closedByName} on ${formatDisplayDateTime(s.closed.closedAt)}` : 'open'}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Income and expenses" subtitle={s.closed ? 'As closed' : 'So far this year'}>
          <dl className="flex flex-col gap-1.5 text-body">
            <div className="flex justify-between">
              <dt>Income</dt>
              <dd className="tabular">{formatINR(s.income)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Expenses</dt>
              <dd className="tabular">{formatINR(s.expense)}</dd>
            </div>
            <div className="flex justify-between border-t border-line-subtle pt-1.5 text-label">
              <dt>{s.surplus >= 0 ? 'Surplus' : 'Deficit'}</dt>
              <dd className="tabular">{formatINR(Math.abs(s.surplus))}</dd>
            </div>
          </dl>
          <p className="mt-3 text-caption">
            <Link className="text-brand-text hover:underline" to={`/reports/profit-loss?from=${s.from}&to=${s.to}`}>
              Profit &amp; loss
            </Link>{' '}
            ·{' '}
            <Link className="text-brand-text hover:underline" to={`/reports/balance-sheet?asOf=${s.to < s.today ? s.to : s.today}`}>
              Balance sheet
            </Link>
          </p>
        </Panel>

        <Panel title="1. Annual interest" subtitle={ip ? `Share deposit ${ip.rates.SHARE_DEPOSIT}% · CRD ${ip.rates.CRD}% · SRDS ${ip.rates.SRDS}% · ${ip.basis === 'YEAR_END' ? 'year-end balance' : 'average of month-ends'}` : 'Rates are in Settings → Deposits'}>
          {ip ? (
            <>
              <dl className="flex flex-col gap-1.5 text-body">
                {(['SHARE_DEPOSIT', 'CRD', 'SRDS'] as const).map((k) => (
                  <div key={k} className="flex justify-between">
                    <dt>{k === 'SHARE_DEPOSIT' ? 'Share deposit' : k}</dt>
                    <dd className="tabular">{formatINR(ip.totals[k])}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line-subtle pt-1.5 text-label">
                  <dt>{new Set(ip.rows.map((r) => r.memberId)).size} members</dt>
                  <dd className="tabular">{formatINR(ip.totals.all)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                {ip.posted ? (
                  <p className="text-caption text-success-fg">Credited ({ip.posted.entryNo}).</p>
                ) : canClose && !s.closed ? (
                  <ButtonV2 text="Credit the interest" disabled={s.to >= s.today || !ip.rows.length} onClick={() => setConfirm('interest')} />
                ) : null}
                {!ip.posted && s.to >= s.today && <p className="mt-2 text-caption text-fg-tertiary">Credited after the year ends on {formatDisplayDate(s.to)}.</p>}
              </div>
            </>
          ) : (
            <p className="text-caption text-fg-tertiary">Loading…</p>
          )}
        </Panel>

        <Panel title="2. Close the year" subtitle="Income and expenses go to the surplus; nothing more can be dated in the year.">
          {s.closed ? (
            <p className="text-caption text-success-fg">Closed. {s.closed.surplus >= 0 ? 'Surplus' : 'Deficit'} {formatINR(Math.abs(s.closed.surplus))}.</p>
          ) : (
            <>
              {s.blockers.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-caption text-fg-secondary">
                  {s.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {!s.interestPosted && s.canClose && <p className="mb-3 text-caption text-warning-fg">The annual interest is not credited yet.</p>}
              {canClose && <ButtonV2 text="Close the year" buttonType={ButtonV2Type.DANGER} disabled={!s.canClose} onClick={() => setConfirm('close')} />}
            </>
          )}
        </Panel>
      </div>

      {s.closed && (
        <Panel title="3. Dividend" subtitle="On each member's share capital at the year end, at the rate the general body approved.">
          {s.dividend ? (
            <p className="text-body">
              {s.dividend.ratePercent}% declared ({s.dividend.entryNo}), {formatINR(s.dividend.total)}. {s.dividend.paid ? 'Paid to members.' : ''}
              {!s.dividend.paid && canClose && (
                <span className="ml-3">
                  <ButtonV2 text="Pay from the bank" size={ButtonV2Size.SMALL} onClick={() => setConfirm('pay')} />
                </span>
              )}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-40">
                <NumberField label="Rate" name="ratePercent" value={rate} onChange={setRate} unit="%" decimals errors={actErrors} disabled={!canClose} />
              </div>
              <div className="w-72">
                <TextField label="General body resolution" name="resolution" value={resolution} onChange={setResolution} errors={actErrors} placeholder="e.g. Res. 4 of 20 Jun 2027" disabled={!canClose} />
              </div>
              <p className="pb-2 text-body">
                {dp ? `${dp.rows.length} members · ${formatINR(dp.total)}` : ''}
              </p>
              {canClose && <ButtonV2 text="Declare" disabled={!(rate > 0)} onClick={() => setConfirm('declare')} />}
            </div>
          )}
        </Panel>
      )}

      {confirm && (
        <ModalV2
          isOpen
          onClose={() => setConfirm(undefined)}
          title={confirm === 'interest' ? `Credit interest for ${year}?` : confirm === 'close' ? `Close ${year}?` : confirm === 'declare' ? `Declare ${rate}% dividend?` : 'Pay the dividend?'}
          subtitle={
            confirm === 'interest'
              ? `${formatINR(ip?.totals.all ?? 0)} goes to members' accounts, dated ${formatDisplayDate(s.to)}. This is done once.`
              : confirm === 'close'
                ? `Income and expenses move to the surplus and the year is locked. Nothing can be dated on or before ${formatDisplayDate(s.to)} after this.`
                : confirm === 'declare'
                  ? `${formatINR(dp?.total ?? 0)} becomes payable to ${dp?.rows.length ?? 0} members, out of the surplus.`
                  : 'One bank payment entry for every member’s declared dividend.'
          }
          primaryAction={{ text: 'Yes, go ahead', onClick: () => act.mutate(confirm), loading: act.isPending }}
          secondaryAction={{ text: 'Cancel', onClick: () => setConfirm(undefined) }}
        >
          {act.error ? <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not done" description={isApiError(act.error) ? act.error.message : 'Try again.'} /> : <span />}
        </ModalV2>
      )}
    </div>
  );
}
