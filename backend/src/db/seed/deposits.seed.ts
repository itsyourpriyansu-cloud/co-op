import { depositColumns } from '../../modules/deposits/deposits.repository';
import { deposits } from '../../models';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P6: every deposit account of the demo dataset (FD at each stage, CRD, SRDS, savings). Emptied by
// the masters seeder's `truncate departments cascade` (deposits → members → departments).
export const depositSeeders: Seeder[] = [
  {
    name: 'deposits',
    run: async (tx) => {
      const rows = demoDataset().deposits.map((d) => ({ id: d.id, ...depositColumns(d) }));
      for (let i = 0; i < rows.length; i += 250) await tx.insert(deposits).values(rows.slice(i, i + 250));
    },
  },
];
