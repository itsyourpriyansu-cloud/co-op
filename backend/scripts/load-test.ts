// G7 (D-117): load test. `npm run load-test -w @tgs/backend -- [--url http://127.0.0.1:4100] [--users 60] [--seconds 60]`
// Simulates members on the app and staff on the console at the same time: each virtual user signs in
// (demo persona sign-in, so run it against a DEMO_MODE server with fictional data, never production),
// then loops over the screens its role opens, with a short think time. Prints requests per second,
// errors and p50 / p95 / p99 per screen. The server's rate limit must be raised for the run
// (RATE_LIMIT_PER_MINUTE=0), since every virtual user shares one IP.
// Pass mark (docs/24 G7): no errors, every read p95 under 1 s and reports under 3 s at 60 users.

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const BASE = `${arg('url', 'http://127.0.0.1:4100')}/api/v1`;
const USERS = Number(arg('users', '60'));
const SECONDS = Number(arg('seconds', '60'));
const THINK_MS = Number(arg('think', '500'));

const MEMBER_SCREENS = ['/me', '/me/home', '/me/loans', '/me/deposits', '/me/payments', '/me/notifications', '/me/surety-requests'];
const STAFF: Record<string, string[]> = {
  'stf-accountant': ['/work-queue', '/dashboard/role', '/members?page=1&pageSize=25', '/loans?page=1&pageSize=25', '/receipts?page=1&pageSize=25', '/notifications', '/reports/dues', '/reports/trial-balance'],
  'stf-secretary': ['/work-queue', '/dashboard/role', '/loans?page=1&pageSize=25', '/deposits?page=1&pageSize=25', '/reports/loans-ledger'],
  'stf-cashier': ['/work-queue', '/dashboard/role', '/receipts?page=1&pageSize=25', '/payment-reports', '/reports/books'],
  'stf-admin': ['/work-queue', '/dashboard/summary', '/users', '/audit?page=1&pageSize=25', '/reports/balance-sheet'],
};
const MEMBERS = ['mem-1101', 'mem-1102', 'mem-1103', 'mem-1104'];

const timings = new Map<string, number[]>();
const errors = new Map<string, number>();
const route = (path: string) => path.split('?')[0]!;

async function signIn(personaId: string, channel: 'app' | 'console'): Promise<string> {
  const res = await fetch(`${BASE}/auth/persona`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personaId, channel }) });
  if (!res.ok) throw new Error(`Sign-in as ${personaId} failed (${res.status}). Is the server in DEMO_MODE?`);
  return ((await res.json()) as { token: string }).token;
}

async function virtualUser(i: number, until: number) {
  const staff = i % 4 === 0; // about a quarter staff, the rest members, as on a busy recovery day
  const persona = staff ? Object.keys(STAFF)[(i / 4) % 4 | 0]! : MEMBERS[i % MEMBERS.length]!;
  const screens = staff ? STAFF[persona]! : MEMBER_SCREENS;
  // Ramp-up: people arrive spread over the first think period, not all in the same millisecond.
  await new Promise((r) => setTimeout(r, Math.random() * THINK_MS));
  const token = await signIn(persona, staff ? 'console' : 'app');
  let n = i;
  while (Date.now() < until) {
    const path = screens[n++ % screens.length]!;
    const t = performance.now();
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
      await res.arrayBuffer();
      if (!res.ok) errors.set(`${route(path)} ${res.status}`, (errors.get(`${route(path)} ${res.status}`) ?? 0) + 1);
    } catch (err) {
      errors.set(`${route(path)} ${(err as Error).message}`, (errors.get(`${route(path)} ${(err as Error).message}`) ?? 0) + 1);
    }
    const list = timings.get(route(path)) ?? [];
    list.push(performance.now() - t);
    timings.set(route(path), list);
    await new Promise((r) => setTimeout(r, THINK_MS * (0.5 + Math.random())));
  }
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

const started = Date.now();
await Promise.all(Array.from({ length: USERS }, (_, i) => virtualUser(i, started + SECONDS * 1000)));
const total = [...timings.values()].reduce((s, l) => s + l.length, 0);
const failed = [...errors.values()].reduce((s, n) => s + n, 0);
console.log(`\n${USERS} users · ${SECONDS} s · ${total} requests · ${(total / SECONDS).toFixed(1)} req/s · ${failed} errors\n`);
console.log(`${'Screen'.padEnd(34)}${'count'.padStart(7)}${'p50 ms'.padStart(9)}${'p95 ms'.padStart(9)}${'p99 ms'.padStart(9)}`);
let pass = failed === 0;
for (const [path, list] of [...timings.entries()].sort()) {
  const s = [...list].sort((a, b) => a - b);
  const p95 = pct(s, 95);
  if (p95 > (path.startsWith('/reports') ? 3000 : 1000)) pass = false;
  console.log(`${path.padEnd(34)}${String(s.length).padStart(7)}${pct(s, 50).toFixed(0).padStart(9)}${p95.toFixed(0).padStart(9)}${pct(s, 99).toFixed(0).padStart(9)}`);
}
for (const [k, n] of errors) console.log(`error: ${k} × ${n}`);
console.log(pass ? '\nPASS: no errors, reads p95 < 1 s, reports p95 < 3 s.' : '\nFAIL: see the rows above.');
process.exitCode = pass ? 0 : 1;

export {};
