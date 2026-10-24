// In-memory store + JSON snapshot persistence (docs/07 §6).
// Every route reads/writes `store.db`, then calls `store.save()`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSeed, SEED_VERSION, type Dataset } from '@tgs/mock-data';
import type { DemoState, SessionUser } from '@tgs/types';

export interface Db extends Dataset {
  demo: DemoState;
  /** token → session user. Survives restarts via the snapshot. */
  sessions: Record<string, SessionUser>;
}

function freshDb(latencyMs: [number, number]): Db {
  const seed = createSeed();
  // The demo clock starts at the dataset's anchor date so ages, retirements and cycles agree.
  return { ...seed, demo: { today: seed.today, failureRate: 0, latencyMs, seedVersion: seed.version }, sessions: {} };
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
      return db.demo?.seedVersion === SEED_VERSION ? db : undefined;
    } catch {
      return undefined;
    }
  }
}
