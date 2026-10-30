import type { ISODate } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { todayIST } from './dates';

let cached: { at: number; today: ISODate } | undefined;

/**
 * "Today" for business rules (leftover service, joining date, transfers). While the mock API owns
 * the demo clock (docs/20, until P9) it is the demo date, so the backend and the demo agree;
 * otherwise India's date.
 */
export async function businessToday(app: FastifyInstance): Promise<ISODate> {
  if (!app.mockBridge) return todayIST();
  if (cached && Date.now() - cached.at < 3000) return cached.today;
  try {
    const state = await app.mockBridge.getPublic<{ today: ISODate }>('/api/v1/__demo/state');
    cached = { at: Date.now(), today: state.today };
    return state.today;
  } catch {
    return todayIST();
  }
}

/** A timestamp on the business date (the demo date while the mock owns the clock) at the current time. */
export async function businessNow(app: FastifyInstance): Promise<string> {
  return `${await businessToday(app)}T${new Date().toISOString().slice(11)}`;
}
