import type { Department, DepartmentRow, SessionUser, SocietySettings } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { withTransaction } from '../../db/transaction';
import type { DepartmentRecord, DepartmentsRepository } from './departments.repository';

const toDepartment = (d: DepartmentRecord): Department => ({ id: d.id, code: d.code, name: d.name, kind: d.kind, ddoName: d.ddoName, ddoDesignation: d.ddoDesignation, ...(d.ddoUserId ? { ddoUserId: d.ddoUserId } : {}) });

/** ST-67 departments and their DDOs. */
export class DepartmentsService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: DepartmentsRepository,
  ) {}

  /** D-145: set when one DDO login does the DDO work of every department (ddoMode SINGLE). */
  private async single(): Promise<{ chosen?: string | undefined } | undefined> {
    const s = await this.app.masters.settings();
    return s.ddoMode === 'SINGLE' ? { chosen: s.singleDdoUserId } : undefined;
  }

  /** D-145: the one DDO for all departments, or undefined when each department has its own DDO in charge. */
  async singleDdo(): Promise<{ id: string; name: string } | undefined> {
    const single = await this.single();
    if (!single) return undefined;
    const users = await this.repo.allDdoUsers();
    const u = users.find((x) => x.id === single.chosen) ?? users[0];
    return u ? { id: u.id, name: u.name } : undefined;
  }

  /** D-145: field errors for the DDO setup in a settings change (empty when it is fine). */
  async checkDdoSetup(s: SocietySettings): Promise<Record<string, string>> {
    if (s.ddoMode !== 'SINGLE') return {};
    const users = await this.repo.allDdoUsers();
    if (!users.length) return { ddoMode: 'Add a DDO login in Users first, then choose it here.' };
    if (s.singleDdoUserId && !users.some((u) => u.id === s.singleDdoUserId)) return { singleDdoUserId: 'Choose an active DDO login.' };
    return {};
  }

  async list(user: SessionUser): Promise<DepartmentRow[]> {
    const [rows, ddos, counts] = await Promise.all([this.repo.list(), this.single().then((x) => this.repo.ddoLogins(x)), this.memberCounts()]);
    // ddoUserId is the login actually in charge (the Admin's choice, or the fallback), not only the stored choice.
    return rows.map((d) => {
      const { ddoUserId: _chosen, ...rest } = toDepartment(d);
      return { ...rest, memberCount: counts.get(d.id) ?? 0, ...(ddos.get(d.id) ? { ddoUserId: ddos.get(d.id)! } : {}) };
    });
  }

  /** For other modules (members, joining). */
  async get(id: string): Promise<Department | undefined> {
    const d = await this.repo.byId(id);
    return d ? toDepartment(d) : undefined;
  }

  /** The DDO's console login for a department, if one exists (docs/03 R5). */
  async ddoLogin(departmentId: string): Promise<string | undefined> {
    return (await this.repo.ddoLogins(await this.single())).get(departmentId);
  }

  /** Name of that DDO login (who a request is waiting on). */
  async ddoLoginName(departmentId: string): Promise<string | undefined> {
    return (await this.repo.ddoLoginNames(await this.single())).get(departmentId);
  }

  /** DDO login names by department, for many rows at once. */
  async ddoLoginNames(): Promise<Map<string, string>> {
    return this.repo.ddoLoginNames(await this.single());
  }

  async all(): Promise<Department[]> {
    return (await this.repo.list()).map(toDepartment);
  }

  async create(request: FastifyRequest, body: Partial<Omit<Department, 'ddoUserId'>>): Promise<DepartmentRow[]> {
    // A new department has no DDO logins yet; the in-charge is chosen after one is added in Users.
    const input = await this.validate({ ...body, ddoUserId: undefined });
    const id = `dept-${input.code.toLowerCase()}`;
    if (await this.repo.byId(id)) fail('ALREADY_EXISTS', 'A department with this code already exists.', { fieldErrors: { code: 'This code is already used.' } });
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.insert(tx, { id, ...input });
      await this.app.audit.record(request, { action: 'create', entity: 'department', entityId: id, summary: `Added ${input.name}`, after: input }, tx);
    });
    return this.list(sessionOf(request));
  }

  async update(request: FastifyRequest, id: string, body: Partial<Omit<Department, 'ddoUserId'>> & { ddoUserId?: string | null }): Promise<DepartmentRow[]> {
    const current = (await this.repo.byId(id)) ?? fail('NOT_FOUND', 'Unknown department.');
    const input = await this.validate({ ...toDepartment(current), ...body, ddoUserId: body.ddoUserId === undefined ? (current.ddoUserId ?? undefined) : (body.ddoUserId ?? undefined) }, id);
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(tx, id, input);
      await this.app.audit.record(request, { action: 'update', entity: 'department', entityId: id, summary: `Updated ${input.name}`, before: toDepartment(current), after: input }, tx);
    });
    return this.list(sessionOf(request));
  }

  private async validate(d: Partial<Department>, exceptId?: string): Promise<Omit<Department, 'id' | 'ddoUserId'> & { ddoUserId: string | null }> {
    const fieldErrors: Record<string, string> = {};
    const code = d.code?.trim().toUpperCase() ?? '';
    if (!d.name?.trim()) fieldErrors.name = 'Enter the department name.';
    if (!/^[A-Z0-9]{2,8}$/.test(code)) fieldErrors.code = 'Use 2–8 letters or digits.';
    else if (await this.repo.codeTaken(code, exceptId)) fieldErrors.code = 'This code is already used.';
    if (!d.ddoName?.trim()) fieldErrors.ddoName = "Enter the DDO's name.";
    if (!d.ddoDesignation?.trim()) fieldErrors.ddoDesignation = "Enter the DDO's designation.";
    // D-142: only one DDO is in charge, and it must be an active DDO login of this department.
    if (d.ddoUserId && exceptId && !(await this.repo.ddoUsers(exceptId)).some((u) => u.id === d.ddoUserId)) fieldErrors.ddoUserId = 'Choose an active DDO login of this department.';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    return { code, name: d.name!.trim(), kind: d.kind === 'EXTERNAL_OFFICE' ? 'EXTERNAL_OFFICE' : 'SECRETARY_DEPT', ddoName: d.ddoName!.trim(), ddoDesignation: d.ddoDesignation!.trim(), ddoUserId: d.ddoUserId ?? null };
  }

  /** Active members per department. */
  private async memberCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const m of await this.app.members.all()) if (m.status === 'ACTIVE') counts.set(m.departmentId, (counts.get(m.departmentId) ?? 0) + 1);
    return counts;
  }
}
