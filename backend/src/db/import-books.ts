// G6 (D-116, F-11): `npm run db:import -- <loans|deposits|opening|reconcile> <file.csv> [--as-on YYYY-MM-DD] [--commit]`
// Order at go-live: db:import-register (members) → deposits → loans → opening → reconcile.
// Each import checks every row and prints the problems; it writes only with --commit and no problems.
// Templates and fictional samples: backend/import/.
import { readFileSync } from 'node:fs';
import { formatINR } from '@tgs/domain';
import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import { importDepositRegister } from '../modules/deposits/register-import';
import { importOpeningBalances, reconcileOpening } from '../modules/ledger/opening-import';
import { importLoanRegister } from '../modules/loans/register-import';

const KINDS = { loans: importLoanRegister, deposits: importDepositRegister, opening: importOpeningBalances } as const;
const args = process.argv.slice(2);
const [kind, file] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--as-on');
const asOnAt = args.indexOf('--as-on');
if (!file || !(kind === 'reconcile' || (kind ?? '') in KINDS)) {
  console.error('Usage: npm run db:import -- <loans|deposits|opening|reconcile> <file.csv> [--as-on YYYY-MM-DD] [--commit]');
  process.exit(1);
}
const asOn = asOnAt >= 0 ? args[asOnAt + 1]! : new Date().toISOString().slice(0, 10);
const money = (p: number) => formatINR(p, { decimals: 2 });
const app = await buildApp({ env: loadEnv(), logger: false });
try {
  await app.ready();
  const csv = readFileSync(file, 'utf8');
  if (kind === 'reconcile') {
    const r = await reconcileOpening(app, csv, asOn);
    for (const e of r.errors) console.log(`Row ${e.row}: ${Object.values(e.fieldErrors).join('; ')}`);
    console.log(`Reconciliation as on ${asOn}\n${'Head'.padEnd(44)}${'Old books'.padStart(18)}${'System'.padStart(18)}${'Difference'.padStart(18)}`);
    for (const row of r.rows) console.log(`${`${row.code} ${row.name}`.slice(0, 43).padEnd(44)}${money(row.books).padStart(18)}${money(row.system).padStart(18)}${(row.difference ? money(row.difference) : '—').padStart(18)}`);
    console.log(`3900 Opening balance difference: ${money(r.openingDifference)} · system trial balance ${r.balanced ? 'balances' : 'does NOT balance'}`);
    const ok = !r.errors.length && !r.mismatches && !r.openingDifference && r.balanced;
    console.log(ok ? 'The system agrees with the old books.' : `${r.mismatches} heads differ. Fix the register or post a journal voucher, then run this again.`);
    if (!ok) process.exitCode = 1;
  } else {
    const r = await KINDS[kind as keyof typeof KINDS](app, csv, { commit: args.includes('--commit'), asOn, actor: { id: 'system-import', name: 'Register import' } });
    for (const e of r.errors) console.log(`Row ${e.row}${e.generalNo ? ` (General No. ${e.generalNo})` : ''}: ${Object.entries(e.fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
    console.log(`${r.rows} rows · ${Object.entries(r.totals).map(([k, v]) => `${k} ${money(v)}`).join(' · ')} · as on ${asOn}`);
    console.log(r.errors.length ? `${r.errors.length} rows need fixing; nothing was written.` : r.committed ? 'Imported.' : 'All rows pass. Run again with --commit to write them.');
    if (r.errors.length) process.exitCode = 1;
  }
} finally {
  await app.close();
}
