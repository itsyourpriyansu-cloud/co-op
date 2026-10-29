import { todayIST } from '../../common/utils/dates';
import { APP_VERSION, SERVICE_NAME } from '../../config/constants';
import type { HealthRepository } from './health.repository';
import type { HealthResponse } from './health.schema';

export class HealthService {
  constructor(private readonly repo: HealthRepository) {}

  /** Never throws: a database failure is reported as `ok: false` so monitors can read it. */
  async check(): Promise<HealthResponse> {
    const started = performance.now();
    let database: HealthResponse['database'];
    try {
      const serverVersion = await this.repo.serverVersion();
      database = { ok: true, latencyMs: Math.round(performance.now() - started), serverVersion };
    } catch {
      database = { ok: false, latencyMs: Math.round(performance.now() - started) };
    }
    return { ok: database.ok, service: SERVICE_NAME, version: APP_VERSION, today: todayIST(), database };
  }
}
