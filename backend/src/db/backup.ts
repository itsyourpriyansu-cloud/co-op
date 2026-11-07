// P9 (D-100): backups and the restore drill. `npm run db:backup` writes a compressed dump of
// DATABASE_URL to backend/backups/; `npm run db:restore-drill [file]` restores a dump (a fresh one
// when none is given) into a throw-away database and checks it: every table's row count matches
// and the ledger balances. On Azure the managed point-in-time backups are the primary copy; these
// dumps are the extra, portable copy and the proof that a restore works.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from '../config/env';

const DRILL_DB = 'tgseccsl_restore_drill';

/** pg_dump / pg_restore: PG_BIN, then the usual Windows install, then PATH. */
function tool(name: 'pg_dump' | 'pg_restore'): string {
  const dirs = [process.env.PG_BIN, 'C:/Program Files/PostgreSQL/18/bin'].filter(Boolean) as string[];
  for (const d of dirs) for (const f of [`${d}/${name}.exe`, `${d}/${name}`]) if (existsSync(f)) return f;
  return name;
}

/** Connection settings without the password on the command line (passed through the environment). */
function connection(url: string, database?: string) {
  const u = new URL(url);
  const args = ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username)];
  return { args, db: database ?? u.pathname.slice(1), env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password), ...(u.searchParams.get('sslmode') ? { PGSSLMODE: u.searchParams.get('sslmode')! } : {}) } };
}

export function backup(url: string, dir = join(process.cwd(), 'backups')): string {
  mkdirSync(dir, { recursive: true });
  const c = connection(url);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const file = join(dir, `${c.db}-${stamp}.dump`);
  execFileSync(tool('pg_dump'), [...c.args, '-Fc', '--no-owner', '-f', file, c.db], { env: c.env, stdio: ['ignore', 'ignore', 'inherit'] });
  return file;
}

async function counts(url: string, database: string): Promise<{ tables: Map<string, number>; balanced: boolean }> {
  const u = new URL(url);
  u.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  try {
    const names = (await client.query<{ t: string }>("select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).rows.map((r) => r.t);
    const tables = new Map<string, number>();
    for (const t of names) tables.set(t, Number((await client.query<{ n: string }>(`select count(*) as n from "${t.replace(/"/g, '')}"`)).rows[0]!.n));
    const tb = (await client.query<{ d: string; c: string }>('select coalesce(sum(debit),0) as d, coalesce(sum(credit),0) as c from journal_lines')).rows[0]!;
    return { tables, balanced: tb.d === tb.c };
  } finally {
    await client.end();
  }
}

async function admin(url: string, sqlText: string): Promise<void> {
  const u = new URL(url);
  u.pathname = '/postgres';
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  try {
    await client.query(sqlText);
  } finally {
    await client.end();
  }
}

/** Restores `file` into a throw-away database, compares it with the source and drops it again. */
export async function restoreDrill(url: string, file?: string): Promise<{ file: string; ok: boolean; lines: string[] }> {
  const dump = file ?? backup(url);
  const source = connection(url).db;
  await admin(url, `drop database if exists ${DRILL_DB}`);
  await admin(url, `create database ${DRILL_DB}`);
  try {
    const c = connection(url, DRILL_DB);
    execFileSync(tool('pg_restore'), [...c.args, '--no-owner', '-d', DRILL_DB, dump], { env: c.env, stdio: ['ignore', 'ignore', 'inherit'] });
    const [a, b] = [await counts(url, source), await counts(url, DRILL_DB)];
    const lines: string[] = [];
    let ok = a.tables.size === b.tables.size && b.balanced;
    for (const [t, n] of a.tables) {
      const m = b.tables.get(t);
      if (m !== n) ok = false;
      lines.push(`${m === n ? 'ok ' : 'BAD'} ${t}: ${n}${m === n ? '' : ` → ${m ?? 'missing'}`}`);
    }
    lines.push(`${b.balanced ? 'ok ' : 'BAD'} ledger balances after restore`);
    return { file: dump, ok, lines };
  } finally {
    await admin(url, `drop database if exists ${DRILL_DB}`);
  }
}

// `npm run db:backup` · `npm run db:restore-drill [file]`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = loadEnv();
  const [mode, file] = process.argv.slice(2);
  const run = async () => {
    if (mode === 'drill') {
      const r = await restoreDrill(env.DATABASE_URL, file);
      console.log(`Restore drill of ${r.file}\n${r.lines.join('\n')}\n${r.ok ? 'PASSED' : 'FAILED'}`);
      if (!r.ok) process.exitCode = 1;
    } else console.log(`Backup written: ${backup(env.DATABASE_URL)}`);
  };
  run().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
