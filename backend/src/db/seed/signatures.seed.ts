import { eq, sql } from 'drizzle-orm';
import { keepsAppAccess } from '@tgs/domain';
import type { StaffSignOff } from '@tgs/types';
import { databaseFileStore } from '../../integrations/file-store';
import { deposits, files, loans, membershipApplications, recoveryMandates, staffUsers } from '../../models';
import { makeSignaturePng } from '../../common/utils/png';
import type { Tx } from '../transaction';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// F-01 (D-096): a drawn demo signature for every staff user, every member who uses the app and
// the demo applicants, so the demo signs as before. A new sign-up has none and uploads one.
export const signatureSeeders: Seeder[] = [
  {
    name: 'signatures',
    run: async (tx, ctx) => {
      const d = demoDataset();
      await tx.execute(sql`truncate ${files}`);
      const store = databaseFileStore(tx as never, ctx.dataKey);
      // Every staff login, including the DDO logins made for each department.
      const staff = (await tx.select({ id: staffUsers.id }).from(staffUsers)).map((u) => u.id);
      const owners = [...staff, ...d.members.filter((m) => keepsAppAccess(m.status)).map((m) => m.id), ...d.applicants.map((a) => a.id)];
      const png = owners.map((_, i) => makeSignaturePng(i % 7));
      const fileOf = new Map<string, string>();
      for (let i = 0; i < owners.length; i++) fileOf.set(owners[i]!, (await store.put({ ownerId: owners[i]!, purpose: 'SIGNATURE', mime: 'image/png', bytes: png[i]!, width: 240, height: 80 }, tx)).id);
      await linkSeededSignOffs(tx, fileOf);
    },
  },
];

/** A staff sign-off gets its signer's image; a paper DDO certificate (`manual`) stays without one. */
function link(so: (StaffSignOff & { manual?: unknown }) | undefined, fileOf: Map<string, string>): void {
  const id = so && !so.manual ? fileOf.get(so.byId) : undefined;
  if (so && id) so.signatureFileId = id;
}

/**
 * The seeded records were signed before their signers' images existed, so their forms printed names
 * instead of signatures. Link each signature to the image now, as a live sign-off does when it is made.
 */
async function linkSeededSignOffs(tx: Tx, fileOf: Map<string, string>): Promise<void> {
  for (const row of await tx.select({ id: loans.id, memberId: loans.memberId, data: loans.data }).from(loans)) {
    const l = row.data;
    const member = fileOf.get(row.memberId);
    if (member && l.signature) l.signature.fileId = member;
    if (member && l.receiptAck) l.receiptAck.fileId = member;
    for (const so of Object.values(l.signOffs ?? {})) link(so as StaffSignOff, fileOf);
    for (const s of l.sureties) if (s.status === 'ACCEPTED' && fileOf.has(s.memberId)) s.signatureFileId = fileOf.get(s.memberId)!;
    await tx.update(loans).set({ data: l }).where(eq(loans.id, row.id));
  }
  for (const row of await tx.select({ id: deposits.id, memberId: deposits.memberId, data: deposits.data }).from(deposits)) {
    const dep = row.data;
    const member = fileOf.get(row.memberId);
    if (member && dep.signature) dep.signature.fileId = member;
    link(dep.signOffs?.secretary, fileOf);
    link(dep.signOffs?.president, fileOf);
    await tx.update(deposits).set({ data: dep }).where(eq(deposits.id, row.id));
  }
  for (const row of await tx.select({ id: membershipApplications.id, applicantId: membershipApplications.applicantId, data: membershipApplications.data }).from(membershipApplications)) {
    const a = row.data;
    const applicant = fileOf.get(row.applicantId);
    if (applicant && a.signature) a.signature.fileId = applicant;
    link(a.ddoCertification, fileOf);
    link(a.secretaryApproval, fileOf);
    link(a.presidentApproval, fileOf);
    await tx.update(membershipApplications).set({ data: a }).where(eq(membershipApplications.id, row.id));
  }
  // F5 / F6: the member's signature, and the agreeing DDO's (the department's DDO login).
  const ddoOf = new Map((await tx.select({ id: staffUsers.id, departmentId: staffUsers.departmentId }).from(staffUsers).where(eq(staffUsers.role, 'DDO'))).map((u) => [u.departmentId, u.id]));
  for (const m of await tx.select().from(recoveryMandates)) {
    const ddo = m.agreedOn ? fileOf.get(ddoOf.get(m.departmentId) ?? '') : undefined;
    await tx
      .update(recoveryMandates)
      .set({ signatureFileId: fileOf.get(m.memberId) ?? null, agreedSignatureFileId: ddo ?? null })
      .where(eq(recoveryMandates.id, m.id));
  }
}
