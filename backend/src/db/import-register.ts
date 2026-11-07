// P9 (D-100, F-11): `npm run db:import-register -- <file.csv> [--as-on YYYY-MM-DD] [--commit]`
// Checks the member register and prints every problem by row; with --commit (and no problems) it
// writes the members and their opening share balances. Template: import/members-register-template.csv.
import { readFileSync } from 'node:fs';
import { formatINR } from '@tgs/domain';
import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import { importMemberRegister } from '../modules/members/register-import';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const asOnAt = args.indexOf('--as-on');
if (!file) {
  console.error('Usage: npm run db:import-register -- <file.csv> [--as-on YYYY-MM-DD] [--commit]');
  process.exit(1);
}
const app = await buildApp({ env: loadEnv(), logger: false });
try {
  await app.ready();
  const asOn = asOnAt >= 0 ? args[asOnAt + 1]! : new Date().toISOString().slice(0, 10);
  const r = await importMemberRegister(app, readFileSync(file, 'utf8'), { commit: args.includes('--commit'), asOn, actor: { id: 'system-import', name: 'Register import' } });
  for (const e of r.errors) console.log(`Row ${e.row}${e.generalNo ? ` (General No. ${e.generalNo})` : ''}: ${Object.entries(e.fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  console.log(`${r.rows} rows · share capital ${formatINR(r.shareCapital, { decimals: 2 })} · share deposit ${formatINR(r.shareDeposit, { decimals: 2 })} · as on ${asOn}`);
  console.log(r.errors.length ? `${r.errors.length} rows need fixing; nothing was written.` : r.committed ? 'Imported.' : 'All rows pass. Run again with --commit to write them.');
  if (r.errors.length) process.exitCode = 1;
} finally {
  await app.close();
}
