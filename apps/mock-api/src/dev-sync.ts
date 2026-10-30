// Dev-only bridge for the production backend (docs/22 §4, §5.4). While the backend moves modules
// over phase by phase, it pushes the records it now owns here (so the mock's loans, deposits and
// demand still see them) and reads the parts the mock still owns. Removed with the fallback in P9.
import type { Loan, Member, MembershipApplication, ProfileChangeRequest, RecoveryMandate, ServiceEvent, ShareAccount, TransferEvent } from '@tgs/types';
import { notify, type Api } from './common';
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
  /** Discarded loan drafts. */
  deleteLoans?: string[];
}

/** Loans this mock changed (collections, until P7); the backend pulls them after each write. */
const dirtyLoans = new Set<string>();
export const markLoanDirty = (id: string) => dirtyLoans.add(id);

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

  /** Reverse sync until P7: loans collections changed here since the last pull. */
  api.get('/__demo/legacy/dirty-loans', (c) => {
    const loans = store.db.loans.filter((l) => dirtyLoans.has(l.id));
    dirtyLoans.clear();
    return c.json({ loans });
  });

  /** Until P6 / P7: a member's deposits (with pledges) and share account, for the backend's loan rules. */
  api.get('/__demo/legacy/holdings/:memberId', (c) => {
    const id = c.req.param('memberId');
    return c.json({ shares: store.db.shareAccounts.find((s) => s.memberId === id) ?? null, deposits: store.db.deposits.filter((d) => d.memberId === id) });
  });

  /** Deposits stay here until P6: the backend pledges an FD to a loan, or releases it (loanId null). */
  api.post('/__demo/legacy/pledge', async (c) => {
    const body = await c.req.json<{ depositId?: string; loanId?: string | null }>().catch(() => ({}) as { depositId?: string });
    const d = store.db.deposits.find((x) => x.id === body.depositId) ?? fail('NOT_FOUND', 'Unknown deposit.');
    if ('loanId' in body && body.loanId) d.pledgedToLoanId = body.loanId;
    else if (d.pledgedToLoanId) delete d.pledgedToLoanId;
    store.save();
    return c.json({ ok: true as const });
  });

  api.get('/__demo/legacy/members-summary', (c) => c.json(legacyMembersSummary(store.db)));

  api.get('/__demo/legacy/member/:id', (c) => {
    const m = store.db.members.find((x) => x.id === c.req.param('id'));
    if (!m) return fail('NOT_FOUND', 'Unknown member.');
    return c.json(legacyMemberExtras(store.db, m));
  });
}
