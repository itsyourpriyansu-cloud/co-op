// In-memory store + JSON snapshot persistence (docs/07 §6).
// Every route reads/writes `store.db`, then calls `store.save()`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSeed, SEED_VERSION, type Dataset } from '@tgs/mock-data';
import type { DemoState, MemberPreferences, OutboxMessage, SessionUser } from '@tgs/types';

export interface Db extends Dataset {
  demo: DemoState;
  /** token → session user. Survives restarts via the snapshot. */
  sessions: Record<string, SessionUser>;
  /** M8: member app passwords (scrypt hash). Missing = the demo password for activated members (D-062). */
  credentials: Record<string, { hash: string; salt: string; setAt: string }>;
  /** M8 MB-14 notification preferences by member id. */
  preferences: Record<string, MemberPreferences>;
  /** M9 ST-03 simulated outbox (composer sends). */
  messageLog: OutboxMessage[];
}

/** D-145: with one DDO for all departments (ddoMode SINGLE), that DDO login: the Admin's choice if it is
 *  still an active DDO, else the longest-standing active DDO login. Undefined when each department has its own. */
export function singleDdo(db: Db) {
  if (db.settings.ddoMode !== 'SINGLE') return undefined;
  const all = db.staffUsers.filter((u) => u.role === 'DDO' && u.active !== false);
  return all.find((u) => u.id === db.settings.singleDdoUserId) ?? all[0];
}

/** D-142: the DDO login in charge of a department: the Admin's choice if it is still an active DDO there,
 *  else the department's longest-standing active DDO login. Every DDO task goes to this one.
 *  D-145: with one DDO for all departments, that one for every department. */
export function ddoInCharge(db: Db, departmentId: string | undefined) {
  if (db.settings.ddoMode === 'SINGLE') return singleDdo(db);
  const mine = db.staffUsers.filter((u) => u.role === 'DDO' && u.departmentId === departmentId && u.active !== false);
  return mine.find((u) => u.id === db.departments.find((d) => d.id === departmentId)?.ddoUserId) ?? mine[0];
}

function freshDb(latencyMs: [number, number]): Db {
  const seed = createSeed();
  // The demo clock starts at the dataset's anchor date so ages, retirements and cycles agree.
  return { ...seed, demo: { today: seed.today, failureRate: 0, latencyMs, seedVersion: seed.version }, sessions: {}, credentials: {}, preferences: {}, messageLog: [] };
}

export interface StoreOptions {
  persist: boolean;
  dataDir: string;
  latencyMs: [number, number];
}

export class Store {
  db: Db;
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: StoreOptions) {
    this.file = join(options.dataDir, 'snapshot.json');
    this.db = this.load() ?? freshDb(options.latencyMs);
  }

  /** Restores the seed. Sessions are kept so nobody is logged out mid-demo. */
  reset(): Db {
    const sessions = this.db.sessions;
    this.db = { ...freshDb(this.options.latencyMs), sessions };
    this.save();
    return this.db;
  }

  save(): void {
    if (!this.options.persist) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (!this.options.persist) return;
    mkdirSync(this.options.dataDir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.db));
  }

  private load(): Db | undefined {
    if (!this.options.persist || !existsSync(this.file)) return undefined;
    try {
      const db = JSON.parse(readFileSync(this.file, 'utf8')) as Db;
      // Older seed shape → reseed (docs/07 §6).
      if (db.demo?.seedVersion !== SEED_VERSION) return undefined;
      db.credentials ??= {};
      db.preferences ??= {};
      db.messageLog ??= [];
      return db;
    } catch {
      return undefined;
    }
  }
}
