import type { DashboardSummary, RoleDashboard, SearchHit, Session, WorkQueue } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// P8b (docs/22 §5.7): work queue, dashboards and search from the backend; REQ-135 service targets.
describe('work queue, dashboards and search (P8b)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let ddo: Session;
  const data = demoDataset();
  const get = async <T>(url: string, s: Session) => {
    const res = await app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
    expect(res.statusCode).toBe(200);
    return res.json() as T;
  };
  const setTargets = (v: { membershipTargetHours?: number; loanTargetDays?: number }) => app.inject({ method: 'PUT', url: '/api/v1/settings/values', headers: bearer(admin), payload: v });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, ddo] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(() => app.close());

  it('the work queue is oldest first, its tabs add up, and the DDO sees only their department', async () => {
    const q = await get<WorkQueue>('/work-queue', accountant);
    expect(q.items.length).toBeGreaterThan(0);
    expect(q.items.map((i) => i.days)).toEqual([...q.items.map((i) => i.days)].sort((a, b) => b - a));
    expect(q.tabs.reduce((s, t) => s + t.count, 0)).toBe(q.items.length);
    expect(q.items.some((i) => i.kind === 'loan')).toBe(true);

    const mine = await get<WorkQueue>('/work-queue', ddo);
    const fin = data.departments.find((d) => d.id === data.staffUsers.find((u) => u.id === 'stf-ddo-fin')!.departmentId)!;
    expect(mine.scope.departmentName).toBe(fin.name);
    expect(mine.items.every((i) => i.departmentName === fin.name)).toBe(true);
  });

  it('a sheet sent to the DDO asks the DDO to enter deductions (P7b)', async () => {
    const sent = data.demandSheets.find((s) => s.status === 'SENT_TO_DDO' && s.departmentId === data.staffUsers.find((u) => u.id === 'stf-ddo-fin')!.departmentId);
    if (!sent) return;
    expect((await get<WorkQueue>('/work-queue', ddo)).items.find((i) => i.id === sent.id)?.actionLabel).toBe('Enter deductions');
  });

  it('service targets are Admin settings; work past them is flagged and counted', async () => {
    await setTargets({ loanTargetDays: 1, membershipTargetHours: 1 });
    const q = await get<WorkQueue>('/work-queue', accountant);
    const over = q.items.filter((i) => i.overTarget);
    expect(over.length).toBeGreaterThan(0);
    expect(over.every((i) => i.kind === 'loan' || i.kind === 'membership')).toBe(true);
    expect(over.find((i) => i.kind === 'loan')?.targetLabel).toBe('1-working-day target');
    expect((await get<RoleDashboard>('/dashboard/role', accountant)).overTarget).toBe(over.length);

    await setTargets({ loanTargetDays: 0, membershipTargetHours: 0 });
    expect((await get<WorkQueue>('/work-queue', accountant)).items.some((i) => i.overTarget)).toBe(false);
    expect((await setTargets({ loanTargetDays: -1 })).statusCode).toBe(400);
    await setTargets({ loanTargetDays: 5, membershipTargetHours: 48 });
  });

  it('the role dashboard is built on the work queue', async () => {
    const [q, d] = await Promise.all([get<WorkQueue>('/work-queue', accountant), get<RoleDashboard>('/dashboard/role', accountant)]);
    expect(d.variant).toBe('ACCOUNTANT');
    expect(d.queue.map((x) => [x.key, x.count])).toEqual(q.tabs.map((t) => [t.key, t.count]));
    expect(d.tiles.find((t) => t.key === 'waiting')?.value).toBe(q.items.length);
    expect(d.demand?.byStatus).toHaveLength(5);
    expect((await get<RoleDashboard>('/dashboard/role', ddo)).variant).toBe('DDO');
  });

  it('the summary is scoped to the DDO\'s department', async () => {
    const all = await get<DashboardSummary>('/dashboard/summary', admin);
    const mine = await get<DashboardSummary>('/dashboard/summary', ddo);
    expect(all.activeMembers).toBe(data.members.filter((m) => m.status === 'ACTIVE').length);
    expect(mine.activeMembers).toBeLessThan(all.activeMembers);
    expect(all.pipeline).toHaveLength(7);
    expect(all.collectionsTrend.some((c) => c.recovered > 0)).toBe(true);
  });

  it('search finds members, loans and receipts for staff only', async () => {
    const m = data.members.find((x) => x.status === 'ACTIVE')!;
    expect((await get<SearchHit[]>(`/search?q=${m.generalNo}`, accountant)).some((h) => h.kind === 'member' && h.id === m.id)).toBe(true);
    const loan = data.loans.find((l) => l.status === 'ACTIVE' && l.loanNo)!;
    expect((await get<SearchHit[]>(`/search?q=${encodeURIComponent(loan.loanNo!)}`, accountant)).some((h) => h.kind === 'loan' && h.id === loan.id)).toBe(true);
    const receipt = data.receipts[0]!;
    expect((await get<SearchHit[]>(`/search?q=${encodeURIComponent(receipt.receiptNo)}`, accountant)).some((h) => h.kind === 'receipt')).toBe(true);
    expect(await get<SearchHit[]>('/search?q=a', accountant)).toEqual([]);
    const member = await signInAs(app, 'mem-1103');
    expect((await app.inject({ method: 'GET', url: '/api/v1/work-queue', headers: bearer(member) })).statusCode).toBe(403);
  });
});
