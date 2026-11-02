// Dev-only bridge for the production backend (docs/22 §4, §5.4). While the backend moves modules
// over phase by phase, it pushes the records it now owns here (so the mock's loans, deposits and
// demand still see them) and reads the parts the mock still owns. Removed with the fallback in P9.
import type { DepositAccount, DepositLedgerRow, Loan, Member, MembershipApplication, ProfileChangeRequest, RecoveryMandate, ServiceEvent, ShareAccount, TransferEvent } from '@tgs/types';
import { randomUUID } from 'node:crypto';
import { notify, type Api } from './common';
import { depositLedger } from './deposits';
import { fail } from './errors';
import { legacyMemberExtras, legacyMembersSummary } from './members';
import type { Store } from './store';

interface SyncBody {
  members?: Member[];
  mandates?: RecoveryMandate[];
  serviceEvents?: ServiceEvent[];
  transfers?: TransferEvent[];
  shareAccounts?: ShareAccount[];
  profileChangeRequests?: ProfileChangeRequest[];
  membershipApplications?: MembershipApplication[];
  loans?: Loan[];
  deposits?: DepositAccount[];
  /** Discarded loan drafts. */
  deleteLoans?: string[];
}

/** Loans and deposits this mock changed (collections, until P7); the backend pulls them after each write. */
const dirtyLoans = new Set<string>();
const dirtyDeposits = new Set<string>();
export const markLoanDirty = (id: string) => dirtyLoans.add(id);
export const markDepositDirty = (id: string) => dirtyDeposits.add(id);

function upsert<T>(list: T[], items: T[] | undefined, key: (x: T) => string) {
  for (const item of items ?? []) {
    const i = list.findIndex((x) => key(x) === key(item));
    if (i >= 0) list[i] = item;
    else list.push(item);
  }
}

export function registerDevSync(api: Api, store: Store) {
  api.post('/__demo/sync', async (c) => {
    const body = await c.req.json<SyncBody>().catch(() => ({}) as SyncBody);
    const db = store.db;
    upsert(db.members, body.members, (m) => m.id);
    upsert(db.mandates, body.mandates, (m) => m.id);
    upsert(db.serviceEvents, body.serviceEvents, (e) => e.id);
    upsert(db.transfers, body.transfers, (t) => t.id);
    upsert(db.shareAccounts, body.shareAccounts, (s) => s.memberId);
    upsert(db.profileChangeRequests, body.profileChangeRequests, (r) => r.id);
    upsert(db.membershipApplications, body.membershipApplications, (a) => a.id);
    upsert(db.loans, body.loans, (l) => l.id);
    upsert(db.deposits, body.deposits, (d) => d.id);
    if (body.deleteLoans?.length) db.loans = db.loans.filter((l) => !body.deleteLoans!.includes(l.id));
    store.save();
    return c.json({ ok: true as const });
  });

  /** In-app notifications stay here until P8: the backend asks for one by template (ST-63). */
  api.post('/__demo/notify', async (c) => {
    const body = await c.req.json<{ recipientId?: string; templateKey?: string; vars?: Record<string, string | number>; link?: string }>().catch(() => ({}) as { recipientId?: string });
    if (!body.recipientId || !('templateKey' in body) || !body.templateKey) return fail('VALIDATION_ERROR', 'recipientId and templateKey are required.');
    const n = notify(store, body.recipientId, body.templateKey, body.vars ?? {}, body.link);
    store.save();
    return c.json({ ok: true as const, id: n?.id ?? null });
  });

  /** Reverse sync until P7: loans and deposits collections changed here since the last pull. */
  api.get('/__demo/legacy/dirty', (c) => {
    const loans = store.db.loans.filter((l) => dirtyLoans.has(l.id));
    const deposits = store.db.deposits.filter((d) => dirtyDeposits.has(d.id));
    dirtyLoans.clear();
    dirtyDeposits.clear();
    return c.json({ loans, deposits });
  });

  /** Receipts stay here until P7: the backend records an FD payment and gets its receipt number. */
  api.post('/__demo/legacy/receipts', async (c) => {
    const b = await c.req.json<{ memberId: string; date: string; mode: 'CASH' | 'TRANSFER' | 'CHEQUE'; amount: number; denominations?: Record<string, number>; reference?: string; depositId: string }>();
    const db = store.db;
    const receiptNo = `RCT-${db.demo.today.slice(0, 4)}-${String(db.receipts.length + 1).padStart(5, '0')}`;
    db.receipts.push({ id: `rct-${randomUUID().slice(0, 8)}`, receiptNo, memberId: b.memberId, date: b.date, source: b.mode === 'CASH' ? 'CASH' : 'BANK_TRANSFER', amount: b.amount, ...(b.denominations ? { denominations: b.denominations } : {}), allocations: [], purpose: 'FD', depositId: b.depositId, ...(b.reference ? { reference: b.reference } : {}) });
    store.save();
    return c.json({ receiptNo });
  });

  /** CRD / SRDS passbook from the salary-recovery receipts (receipts move in P7). */
  api.get('/__demo/legacy/deposit-ledger/:id', (c) => {
    const d = store.db.deposits.find((x) => x.id === c.req.param('id'));
    return c.json<DepositLedgerRow[]>(d ? depositLedger(store.db, d) : []);
  });

  /** Until P7: a member's share account, for the backend's loan rules. */
  api.get('/__demo/legacy/holdings/:memberId', (c) => {
    const id = c.req.param('memberId');
    return c.json({ shares: store.db.shareAccounts.find((s) => s.memberId === id) ?? null });
  });

  api.get('/__demo/legacy/members-summary', (c) => c.json(legacyMembersSummary(store.db)));

  api.get('/__demo/legacy/member/:id', (c) => {
    const m = store.db.members.find((x) => x.id === c.req.param('id'));
    if (!m) return fail('NOT_FOUND', 'Unknown member.');
    return c.json(legacyMemberExtras(store.db, m));
  });
}
