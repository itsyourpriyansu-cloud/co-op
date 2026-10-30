import type { Department, DepartmentRow, SessionUser } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { withTransaction } from '../../db/transaction';
import type { DepartmentRecord, DepartmentsRepository } from './departments.repository';

const toDepartment = (d: DepartmentRecord): Department => ({ id: d.id, code: d.code, name: d.name, kind: d.kind, ddoName: d.ddoName, ddoDesignation: d.ddoDesignation });

/** ST-67 departments and their DDOs. */
export class DepartmentsService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: DepartmentsRepository,
  ) {}

  async list(user: SessionUser): Promise<DepartmentRow[]> {
    const [rows, ddos, counts] = await Promise.all([this.repo.list(), this.repo.ddoLogins(), this.memberCounts(user)]);
    return rows.map((d) => ({ ...toDepartment(d), memberCount: counts.get(d.id) ?? 0, ...(ddos.get(d.id) ? { ddoUserId: ddos.get(d.id)! } : {}) }));
  }

  /** For other modules (members, joining). */
  async get(id: string): Promise<Department | undefined> {
    const d = await this.repo.byId(id);
    return d ? toDepartment(d) : undefined;
  }

  /** The DDO's console login for a department, if one exists (docs/03 R5). */
  async ddoLogin(departmentId: string): Promise<string | undefined> {
    return (await this.repo.ddoLogins()).get(departmentId);
  }

  async all(): Promise<Department[]> {
    return (await this.repo.list()).map(toDepartment);
  }

  async create(request: FastifyRequest, body: Partial<Department>): Promise<DepartmentRow[]> {
    const input = await this.validate(body);
    const id = `dept-${input.code.toLowerCase()}`;
    if (await this.repo.byId(id)) fail('ALREADY_EXISTS', 'A department with this code already exists.', { fieldErrors: { code: 'This code is already used.' } });
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.insert(tx, { id, ...input });
      await this.app.audit.record(request, { action: 'create', entity: 'department', entityId: id, summary: `Added ${input.name}`, after: input }, tx);
    });
    return this.list(sessionOf(request));
  }

  async update(request: FastifyRequest, id: string, body: Partial<Department>): Promise<DepartmentRow[]> {
    const current = (await this.repo.byId(id)) ?? fail('NOT_FOUND', 'Unknown department.');
    const input = await this.validate({ ...toDepartment(current), ...body }, id);
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(tx, id, input);
      await this.app.audit.record(request, { action: 'update', entity: 'department', entityId: id, summary: `Updated ${input.name}`, before: toDepartment(current), after: input }, tx);
    });
    return this.list(sessionOf(request));
  }

  private async validate(d: Partial<Department>, exceptId?: string): Promise<Omit<Department, 'id'>> {
    const fieldErrors: Record<string, string> = {};
    const code = d.code?.trim().toUpperCase() ?? '';
    if (!d.name?.trim()) fieldErrors.name = 'Enter the department name.';
    if (!/^[A-Z0-9]{2,8}$/.test(code)) fieldErrors.code = 'Use 2–8 letters or digits.';
    else if (await this.repo.codeTaken(code, exceptId)) fieldErrors.code = 'This code is already used.';
    if (!d.ddoName?.trim()) fieldErrors.ddoName = "Enter the DDO's name.";
    if (!d.ddoDesignation?.trim()) fieldErrors.ddoDesignation = "Enter the DDO's designation.";
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    return { code, name: d.name!.trim(), kind: d.kind === 'EXTERNAL_OFFICE' ? 'EXTERNAL_OFFICE' : 'SECRETARY_DEPT', ddoName: d.ddoName!.trim(), ddoDesignation: d.ddoDesignation!.trim() };
  }

  /**
   * Active members per department. Members move into PostgreSQL in P4; until then the count comes
   * from the mock API through the dev bridge (0 when there is no mock, e.g. in production).
   * TODO(P4): count from the members table.
   */
  private async memberCounts(user: SessionUser): Promise<Map<string, number>> {
    const rows = await this.app.mockBridge?.getAs<DepartmentRow[]>(user, '/api/v1/departments').catch(() => undefined);
    return new Map((rows ?? []).map((r) => [r.id, r.memberCount]));
  }
}
