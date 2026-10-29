import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client';

export class HealthRepository {
  constructor(private readonly db: Database) {}

  /** One round trip to PostgreSQL; returns its version number, e.g. "18.1". */
  async serverVersion(): Promise<string> {
    const result = await this.db.execute<{ server_version: string }>(sql`show server_version`);
    return result.rows[0]?.server_version.split(' ')[0] ?? 'unknown';
  }
}
