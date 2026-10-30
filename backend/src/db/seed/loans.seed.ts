import { loanColumns } from '../../modules/loans/loans.repository';
import { loans } from '../../models';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P5 (docs/22 §5.5): every loan of the demo dataset, at every stage. Emptied by the masters
// seeder's `truncate departments cascade` (loans → members → departments).
export const loanSeeders: Seeder[] = [
  {
    name: 'loans',
    run: async (tx) => {
      const rows = demoDataset().loans.map((l) => ({ id: l.id, ...loanColumns(l) }));
      for (let i = 0; i < rows.length; i += 200) await tx.insert(loans).values(rows.slice(i, i + 200));
    },
  },
];
