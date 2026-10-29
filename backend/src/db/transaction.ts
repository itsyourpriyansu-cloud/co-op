import type { Database } from './client';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Run `work` in one database transaction: every write commits together or none does.
 * Services use this for workflow transitions and ledger postings (docs/22 §3).
 */
export function withTransaction<T>(db: Database, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}
