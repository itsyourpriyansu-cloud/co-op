import type { ProfileChangeRequest } from '@tgs/types';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { profileChangeRequests, staffUsers } from '../../models';

type Row = typeof profileChangeRequests.$inferSelect;

export const toRequest = (r: Row): ProfileChangeRequest => ({
  id: r.id,
  memberId: r.memberId,
  fields: r.fields,
  reason: r.reason,
  ...(r.documentName ? { documentName: r.documentName } : {}),
  route: r.route,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  ...(r.ddoCertified ? { ddoCertified: r.ddoCertified } : {}),
  ...(r.decidedByName ? { decidedByName: r.decidedByName } : {}),
  ...(r.decidedAt ? { decidedAt: r.decidedAt.toISOString() } : {}),
  ...(r.remarks ? { remarks: r.remarks } : {}),
});

export class ProfileChangesRepository {
  constructor(private readonly db: Database) {}

  async all(): Promise<ProfileChangeRequest[]> {
    return (await this.db.select().from(profileChangeRequests).orderBy(desc(profileChangeRequests.createdAt))).map(toRequest);
  }

  async forMember(memberId: string): Promise<ProfileChangeRequest[]> {
    return (await this.db.select().from(profileChangeRequests).where(eq(profileChangeRequests.memberId, memberId)).orderBy(desc(profileChangeRequests.createdAt))).map(toRequest);
  }

  async pending(): Promise<ProfileChangeRequest[]> {
    return (await this.db.select().from(profileChangeRequests).where(eq(profileChangeRequests.status, 'PENDING'))).map(toRequest);
  }

  /** Locks the row: two staff deciding at once never both win. */
  async lock(tx: Tx, id: string): Promise<ProfileChangeRequest | undefined> {
    const [row] = await tx.select().from(profileChangeRequests).where(eq(profileChangeRequests.id, id)).for('update');
    return row ? toRequest(row) : undefined;
  }

  async find(id: string): Promise<ProfileChangeRequest | undefined> {
    const [row] = await this.db.select().from(profileChangeRequests).where(eq(profileChangeRequests.id, id));
    return row ? toRequest(row) : undefined;
  }

  async insert(tx: Tx, r: ProfileChangeRequest): Promise<void> {
    await tx.insert(profileChangeRequests).values({ ...r, documentName: r.documentName ?? null, createdAt: new Date(r.createdAt), ddoCertified: r.ddoCertified ?? null, decidedByName: null, decidedAt: null, remarks: null });
  }

  async save(tx: Tx, r: ProfileChangeRequest): Promise<void> {
    await tx
      .update(profileChangeRequests)
      .set({ status: r.status, ddoCertified: r.ddoCertified ?? null, decidedByName: r.decidedByName ?? null, decidedAt: r.decidedAt ? new Date(r.decidedAt) : null, remarks: r.remarks ?? null })
      .where(eq(profileChangeRequests.id, r.id));
  }

  /** Name of the active staff user in a role (who a request is waiting on). */
  async staffName(role: 'ACCOUNTANT'): Promise<string | undefined> {
    const [row] = await this.db.select({ name: staffUsers.name }).from(staffUsers).where(and(eq(staffUsers.role, role), eq(staffUsers.status, 'ACTIVE')));
    return row?.name;
  }
}
