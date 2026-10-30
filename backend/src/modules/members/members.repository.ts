import type { Member, RecoveryMandate, ServiceEvent, TransferEvent } from '@tgs/types';
import { and, desc, eq, max, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { memberTransfers, members, recoveryMandates, serviceEvents } from '../../models';
import { maskMobile } from '@tgs/domain';

type MemberRow = typeof members.$inferSelect;

/** The API's Member shape (same as the mock) from a database row. */
export function toMember(r: MemberRow): Member {
  return {
    id: r.id,
    generalNo: r.generalNo,
    employeeId: r.employeeId,
    name: r.name,
    fatherName: r.fatherName,
    gender: r.gender,
    dob: r.dob,
    mobile: r.mobile,
    mobileMasked: maskMobile(r.mobile),
    ...(r.email ? { email: r.email } : {}),
    presentAddress: r.presentAddress,
    permanentAddress: r.permanentAddress,
    designation: r.designation,
    departmentId: r.departmentId,
    doj: r.doj,
    dor: r.dor,
    employmentType: r.employmentType,
    numberOfShares: r.numberOfShares,
    nominee: r.nominee,
    payProfile: r.payProfile,
    ...(r.anniversaryDate ? { anniversaryDate: r.anniversaryDate } : {}),
    status: r.status,
    portalActivated: r.portalActivated,
    joinedSocietyOn: r.joinedSocietyOn,
  };
}

const toEvent = (e: typeof serviceEvents.$inferSelect): ServiceEvent => ({
  id: e.id,
  memberId: e.memberId,
  type: e.type,
  date: e.date,
  summary: e.summary,
  ...(e.effectiveCycle ? { effectiveCycle: e.effectiveCycle } : {}),
  ...(e.byName ? { byName: e.byName } : {}),
});

const toMandate = (m: typeof recoveryMandates.$inferSelect): RecoveryMandate => ({
  id: m.id,
  memberId: m.memberId,
  departmentId: m.departmentId,
  status: m.status,
  signedOn: m.signedOn,
  ...(m.agreedOn ? { agreedOn: m.agreedOn } : {}),
  ...(m.agreedByName ? { agreedByName: m.agreedByName } : {}),
});

const toTransfer = (t: typeof memberTransfers.$inferSelect): TransferEvent => ({
  id: t.id,
  memberId: t.memberId,
  fromDepartmentId: t.fromDepartmentId,
  toDepartmentId: t.toDepartmentId,
  effectiveCycle: t.effectiveCycle,
  ...(t.effectiveDate ? { effectiveDate: t.effectiveDate } : {}),
  orderRef: t.orderRef,
  ...(t.remarks ? { remarks: t.remarks } : {}),
  ...(t.recordedAt ? { recordedAt: t.recordedAt.toISOString() } : {}),
  ...(t.recordedByName ? { recordedByName: t.recordedByName } : {}),
});

/** Member values for an insert or update (mobileMasked is derived, never stored). */
const toValues = ({ mobileMasked: _m, email, anniversaryDate, ...m }: Member) => ({ ...m, email: email ?? null, anniversaryDate: anniversaryDate ?? null });

export class MembersRepository {
  constructor(private readonly db: Database) {}

  /** All members a user may see: every member, or one department for a DDO. */
  async list(departmentId?: string): Promise<Member[]> {
    const rows = await this.db.select().from(members).where(departmentId ? eq(members.departmentId, departmentId) : undefined);
    return rows.map(toMember);
  }

  /** By id or by General No. */
  async find(idOrGeneralNo: string, tx?: Tx): Promise<Member | undefined> {
    const [row] = await (tx ?? this.db).select().from(members).where(or(eq(members.id, idOrGeneralNo), eq(members.generalNo, idOrGeneralNo)));
    return row ? toMember(row) : undefined;
  }

  /** The few fields validateMemberInput needs to find duplicates (employee ID, mobile). */
  async others(exceptId?: string): Promise<Member[]> {
    const rows = await this.db.select().from(members).where(exceptId ? ne(members.id, exceptId) : undefined);
    return rows.map(toMember);
  }

  async maxGeneralNo(): Promise<number> {
    const [row] = await this.db.select({ top: max(sql<number>`${members.generalNo}::int`) }).from(members);
    return Number(row?.top ?? 0);
  }

  async nextGeneralNo(tx: Tx): Promise<string> {
    // Serialise allotment: two new members at once never get the same number.
    await tx.execute(sql`lock table ${members} in share row exclusive mode`);
    const [row] = await tx.select({ top: max(sql<number>`${members.generalNo}::int`) }).from(members);
    return String(Number(row?.top ?? 0) + 1);
  }

  async insert(tx: Tx, m: Member): Promise<void> {
    await tx.insert(members).values(toValues(m));
  }

  async update(tx: Tx, m: Member): Promise<void> {
    await tx.update(members).set({ ...toValues(m), updatedAt: sql`now()` }).where(eq(members.id, m.id));
  }

  // ---- service history ----
  async events(memberId: string): Promise<ServiceEvent[]> {
    return (await this.db.select().from(serviceEvents).where(eq(serviceEvents.memberId, memberId)).orderBy(desc(serviceEvents.date), desc(serviceEvents.createdAt))).map(toEvent);
  }

  async addEvent(tx: Tx, e: ServiceEvent): Promise<void> {
    await tx.insert(serviceEvents).values({ ...e, effectiveCycle: e.effectiveCycle ?? null, byName: e.byName ?? null });
  }

  // ---- mandates ----
  async currentMandates(departmentId?: string): Promise<Map<string, RecoveryMandate>> {
    const rows = await this.db
      .select()
      .from(recoveryMandates)
      .where(and(ne(recoveryMandates.status, 'SUPERSEDED'), departmentId ? eq(recoveryMandates.departmentId, departmentId) : undefined));
    return new Map(rows.map((r) => [r.memberId, toMandate(r)]));
  }

  async currentMandate(memberId: string, tx?: Tx): Promise<RecoveryMandate | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(recoveryMandates)
      .where(and(eq(recoveryMandates.memberId, memberId), ne(recoveryMandates.status, 'SUPERSEDED')));
    return row ? toMandate(row) : null;
  }

  async insertMandate(tx: Tx, m: RecoveryMandate): Promise<void> {
    await tx.insert(recoveryMandates).values({ ...m, agreedOn: m.agreedOn ?? null, agreedByName: m.agreedByName ?? null });
  }

  async supersedeMandates(tx: Tx, memberId: string): Promise<void> {
    await tx.update(recoveryMandates).set({ status: 'SUPERSEDED' }).where(and(eq(recoveryMandates.memberId, memberId), ne(recoveryMandates.status, 'SUPERSEDED')));
  }

  async agreeMandate(tx: Tx, id: string, on: string, byName: string): Promise<void> {
    await tx.update(recoveryMandates).set({ status: 'AGREED', agreedOn: on, agreedByName: byName }).where(eq(recoveryMandates.id, id));
  }

  // ---- transfers ----
  async transfers(memberId: string): Promise<TransferEvent[]> {
    return (await this.db.select().from(memberTransfers).where(eq(memberTransfers.memberId, memberId))).map(toTransfer);
  }

  async insertTransfer(tx: Tx, t: TransferEvent): Promise<void> {
    await tx.insert(memberTransfers).values({ ...t, effectiveDate: t.effectiveDate ?? null, remarks: t.remarks ?? null, recordedAt: t.recordedAt ? new Date(t.recordedAt) : null, recordedByName: t.recordedByName ?? null });
  }
}
