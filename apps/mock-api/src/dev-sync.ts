// Dev-only bridge for the production backend (docs/22 §4, §5.4). While the backend moves modules
// over phase by phase, it pushes the records it now owns here (so the mock's loans, deposits and
// demand still see them) and reads the parts the mock still owns. Removed with the fallback in P9.
import type { Member, RecoveryMandate, ServiceEvent, ShareAccount, TransferEvent } from '@tgs/types';
import type { Api } from './common';
import { fail } from './errors';
import { legacyMemberExtras, legacyMembersSummary } from './members';
import type { Store } from './store';

interface SyncBody {
  members?: Member[];
  mandates?: RecoveryMandate[];
  serviceEvents?: ServiceEvent[];
  transfers?: TransferEvent[];
  shareAccounts?: ShareAccount[];
}

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
    store.save();
    return c.json({ ok: true as const });
  });

  api.get('/__demo/legacy/members-summary', (c) => c.json(legacyMembersSummary(store.db)));

  api.get('/__demo/legacy/member/:id', (c) => {
    const m = store.db.members.find((x) => x.id === c.req.param('id'));
    if (!m) return fail('NOT_FOUND', 'Unknown member.');
    return c.json(legacyMemberExtras(store.db, m));
  });

  /** Reverse sync until P4c: members the mock's joining flow created after `sinceGeneralNo`. */
  api.get('/__demo/legacy/export-members', (c) => {
    const since = Number(c.req.query('sinceGeneralNo') ?? 0);
    const db = store.db;
    const members = db.members.filter((m) => Number(m.generalNo) > since);
    const ids = new Set(members.map((m) => m.id));
    return c.json({
      members,
      mandates: db.mandates.filter((m) => ids.has(m.memberId)),
      serviceEvents: db.serviceEvents.filter((e) => ids.has(e.memberId)),
    });
  });
}
