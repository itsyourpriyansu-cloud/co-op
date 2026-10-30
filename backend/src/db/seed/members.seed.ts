import { memberTransfers, members, recoveryMandates, serviceEvents } from '../../models';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P4a seeders (docs/22 §5.4): every member of the demo dataset with their service history,
// salary-recovery mandates and transfers. All people are fictional (CLAUDE.md rule 8).
// The masters seeder's `truncate departments cascade` has already emptied these tables.

const memberRecords: Seeder = {
  name: 'members',
  run: async (tx) => {
    const data = demoDataset();
    const rows = data.members.map(({ mobileMasked: _masked, email, anniversaryDate, ...m }) => ({ ...m, email: email ?? null, anniversaryDate: anniversaryDate ?? null }));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(members).values(rows.slice(i, i + 200));
    const events = data.serviceEvents.map((e) => ({ ...e, effectiveCycle: e.effectiveCycle ?? null, byName: e.byName ?? null }));
    for (let i = 0; i < events.length; i += 500) await tx.insert(serviceEvents).values(events.slice(i, i + 500));
    if (data.mandates.length) await tx.insert(recoveryMandates).values(data.mandates.map((m) => ({ ...m, agreedOn: m.agreedOn ?? null, agreedByName: m.agreedByName ?? null })));
    if (data.transfers.length) {
      await tx.insert(memberTransfers).values(
        data.transfers.map((t) => ({ ...t, effectiveDate: t.effectiveDate ?? null, remarks: t.remarks ?? null, recordedAt: t.recordedAt ? new Date(t.recordedAt) : null, recordedByName: t.recordedByName ?? null })),
      );
    }
  },
};

export const memberSeeders: Seeder[] = [memberRecords];
