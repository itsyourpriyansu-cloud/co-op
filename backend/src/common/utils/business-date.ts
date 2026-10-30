import { toCycle } from '@tgs/domain';
import type { ISODate } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { todayIST } from './dates';

let cached: { at: number; today: ISODate; cycle: string } | undefined;

async function state(app: FastifyInstance): Promise<{ today: ISODate; cycle: string }> {
  const own = () => ({ today: todayIST(), cycle: toCycle(todayIST()) });
  if (!app.mockBridge) return own();
  if (cached && Date.now() - cached.at < 3000) return cached;
  try {
    const s = await app.mockBridge.getPublic<{ today: ISODate; currentCycle?: string }>('/api/v1/__demo/state');
    cached = { at: Date.now(), today: s.today, cycle: s.currentCycle ?? toCycle(s.today) };
    return cached;
  } catch {
    return own();
  }
}

/**
 * "Today" for business rules (leftover service, joining date, transfers). While the mock API owns
 * the demo clock (docs/20, until P9) it is the demo date, so the backend and the demo agree;
 * otherwise India's date.
 */
export async function businessToday(app: FastifyInstance): Promise<ISODate> {
  return (await state(app)).today;
}

/** The current demand cycle (YYYY-MM): the demo's while the mock owns the clock, else this month. */
export async function businessCycle(app: FastifyInstance): Promise<string> {
  return (await state(app)).cycle;
}

/** A timestamp on the business date (the demo date while the mock owns the clock) at the current time. */
export async function businessNow(app: FastifyInstance): Promise<string> {
  return `${await businessToday(app)}T${new Date().toISOString().slice(11)}`;
}
