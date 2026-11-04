import { toCycle } from '@tgs/domain';
import type { ISODate } from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { demoDataset } from '../../db/seed/dataset';
import { systemInfo } from '../../models';
import { todayIST } from './dates';

/** The demo clock (docs/20), kept in system_info so every process agrees. `today: null` = the dataset's date. */
export const DEMO_CLOCK_KEY = 'demoClock';

let cached: { at: number; today: ISODate; cycle: string } | undefined;

/** Forget the cached date after the demo clock moves. */
export function clearBusinessDate(): void {
  cached = undefined;
}

async function state(app: FastifyInstance): Promise<{ today: ISODate; cycle: string }> {
  if (!app.env.DEMO_MODE) return { today: todayIST(), cycle: toCycle(todayIST()) };
  if (cached && Date.now() - cached.at < 1000) return cached;
  const [row] = await app.db.select({ value: systemInfo.value }).from(systemInfo).where(eq(systemInfo.key, DEMO_CLOCK_KEY));
  const data = demoDataset();
  // As in the prototype, the demand cycle stays the dataset's while the demo date moves.
  cached = { at: Date.now(), today: (row?.value as { today?: ISODate | null } | undefined)?.today ?? data.today, cycle: data.currentCycle };
  return cached;
}

/**
 * "Today" for business rules (leftover service, joining date, transfers): with DEMO_MODE the demo
 * clock (the dataset's date unless moved), otherwise India's date.
 */
export async function businessToday(app: FastifyInstance): Promise<ISODate> {
  return (await state(app)).today;
}

/** The current demand cycle (YYYY-MM): the dataset's with DEMO_MODE, else this month. */
export async function businessCycle(app: FastifyInstance): Promise<string> {
  return (await state(app)).cycle;
}

/** A timestamp on the business date at the current time. */
export async function businessNow(app: FastifyInstance): Promise<string> {
  return `${await businessToday(app)}T${new Date().toISOString().slice(11)}`;
}
