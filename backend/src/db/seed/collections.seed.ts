import { demandLines, demandSheets, paymentReports, receipts, shareAccounts } from '../../models';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P7 (docs/22 §5.6): share accounts, demand sheets with their lines, receipts and member payment
// reports of the demo dataset. Emptied by the masters seeder's `truncate departments cascade`.
const batch = async <T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
};

export const collectionSeeders: Seeder[] = [
  {
    name: 'share-accounts',
    run: async (tx) => {
      await batch(demoDataset().shareAccounts, 300, (c) => tx.insert(shareAccounts).values(c));
    },
  },
  {
    name: 'demand-sheets',
    run: async (tx) => {
      const sheets = demoDataset().demandSheets;
      await batch(
        sheets.map(({ lines: _l, ...s }) => ({ id: s.id, cycle: s.cycle, departmentId: s.departmentId, status: s.status, totalDemand: s.totalDemand, totalRecovered: s.totalRecovered, data: s })),
        100,
        (c) => tx.insert(demandSheets).values(c),
      );
      const lines = sheets.flatMap((s) => s.lines.map((l) => ({ sheetId: s.id, memberId: l.memberId, cycle: s.cycle, components: l.components, totalDemand: l.totalDemand, recovered: l.recovered ?? null })));
      await batch(lines, 500, (c) => tx.insert(demandLines).values(c));
    },
  },
  {
    name: 'receipts',
    run: async (tx) => {
      const d = demoDataset();
      await batch(
        d.receipts.map((r) => ({ id: r.id, receiptNo: r.receiptNo, memberId: r.memberId, date: r.date, source: r.source, amount: r.amount, cycle: r.cycle ?? null, sheetId: r.sheetId ?? null, sortAt: r.at ?? r.date, data: r })),
        500,
        (c) => tx.insert(receipts).values(c),
      );
      await batch(d.paymentReports.map((p) => ({ id: p.id, memberId: p.memberId, status: p.status, reference: p.reference, data: p })), 100, (c) => tx.insert(paymentReports).values(c));
    },
  },
];
