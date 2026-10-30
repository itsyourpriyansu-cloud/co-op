import type { Member, RecoveryMandate, ServiceEvent } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { withTransaction } from '../../db/transaction';
import type { MembersRepository } from './members.repository';

/**
 * Reverse sync, dev only, until P4c moves joining (docs/22 §5.4): the mock's joining flow still
 * creates members. Right after a joining request succeeds, the backend imports any member the mock
 * created, so the member list never misses one and General Nos never clash. The applicant's
 * Member App sign-in becomes the member's (same login, D-026).
 */
export class MembersImport {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: MembersRepository,
  ) {}

  async fromMock(): Promise<number> {
    const bridge = this.app.mockBridge;
    if (!bridge) return 0;
    const top = await this.repo.maxGeneralNo();
    const batch = await bridge.getPublic<{ members: Member[]; mandates: RecoveryMandate[]; serviceEvents: ServiceEvent[] }>(`/api/v1/__demo/legacy/export-members?sinceGeneralNo=${top}`);
    if (!batch.members.length) return 0;
    await withTransaction(this.app.db, async (tx) => {
      for (const m of batch.members) {
        if (await this.repo.find(m.id, tx)) continue;
        await this.repo.insert(tx, m);
        for (const mandate of batch.mandates.filter((x) => x.memberId === m.id)) await this.repo.insertMandate(tx, mandate);
        for (const e of batch.serviceEvents.filter((x) => x.memberId === m.id)) await this.repo.addEvent(tx, e);
        await this.app.appAccounts.memberJoined(tx, { id: m.id, generalNo: m.generalNo, employeeId: m.employeeId, name: m.name, mobile: m.mobile, active: m.status === 'ACTIVE' });
      }
    });
    this.app.log.info({ count: batch.members.length }, 'imported members created by the mock joining flow');
    return batch.members.length;
  }
}
