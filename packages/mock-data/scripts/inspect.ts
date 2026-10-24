// Prints a summary of the generated dataset (run: npx tsx packages/mock-data/scripts/inspect.ts).
import { formatINR, formatINRCompact } from '@tgs/domain';
import { createSeed } from '../src/index';

const t0 = performance.now();
const d = createSeed();
const ms = Math.round(performance.now() - t0);
const count = <T>(xs: T[], key: (x: T) => string) =>
  Object.entries(xs.reduce<Record<string, number>>((acc, x) => ((acc[key(x)] = (acc[key(x)] ?? 0) + 1), acc), {}))
    .map(([k, v]) => `${k}:${v}`)
    .join('  ');

console.log(`generated in ${ms} ms · JSON ${(JSON.stringify(d).length / 1e6).toFixed(1)} MB`);
console.log('members      ', count(d.members, (m) => m.status));
console.log('loans        ', count(d.loans, (l) => l.status));
console.log('products     ', count(d.loans.filter((l) => l.status === 'ACTIVE'), (l) => l.product));
console.log('deposits     ', count(d.deposits, (x) => `${x.scheme}/${x.status}`));
console.log('memberships  ', count(d.membershipApplications, (a) => a.status));
console.log('demand sheets', count(d.demandSheets, (s) => s.status), `· lines ${d.demandSheets.reduce((s, x) => s + x.lines.length, 0)}`);
console.log('receipts     ', d.receipts.length, count(d.receipts, (r) => r.source));
console.log('scenarios    ', d.scenarios.length);
const active = d.loans.filter((l) => l.status === 'ACTIVE');
console.log('loan book    ', formatINRCompact(active.reduce((s, l) => s + l.outstandingPrincipal, 0)), 'outstanding across', active.length, 'loans');
const oct = d.demandSheets.filter((s) => s.cycle === '2026-09');
console.log('Sep-26 demand', formatINRCompact(oct.reduce((s, x) => s + x.totalDemand, 0)), 'recovered', formatINRCompact(oct.reduce((s, x) => s + x.totalRecovered, 0)));
for (const id of ['mem-1101', 'mem-1102', 'mem-1103', 'mem-1104']) {
  const m = d.members.find((x) => x.id === id);
  const ls = d.loans.filter((l) => l.memberId === id);
  console.log(`${m?.generalNo} ${m?.name} · ${m?.designation} · ${m?.departmentId} · DOR ${m?.dor} · loans: ${ls.map((l) => `${l.product}/${l.status}/${formatINR(l.outstandingPrincipal)}`).join(', ') || 'none'}`);
}
const mahesh = d.demandSheets.filter((s) => s.cycle === '2026-09').flatMap((s) => s.lines).find((l) => l.memberId === 'mem-1104');
console.log('Mahesh Sep-26:', mahesh?.components.map((c) => `${c.head}${c.loanProduct ? '/' + c.loanProduct : ''} ${formatINR(c.allocated)}/${formatINR(c.amount)}`).join(' · '));
