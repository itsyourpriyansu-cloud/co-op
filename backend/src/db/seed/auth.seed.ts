import { ROLE_PERMISSIONS } from '@tgs/domain';
import { createSeed } from '@tgs/mock-data';
import type { Role } from '@tgs/types';
import { sql } from 'drizzle-orm';
import { hashPassword } from '../../common/utils/password';
import { appAccounts, rolePermissions, staffUsers } from '../../models';
import type { Seeder } from '.';

// P1 seeders (docs/22 §5.1): permission matrix, the 6 demo staff, and Member App accounts for
// every active member and the two demo applicants. All data is fictional (CLAUDE.md rule 8).

const permissions: Seeder = {
  name: 'role-permissions',
  run: async (tx) => {
    await tx.delete(rolePermissions);
    const rows = (Object.entries(ROLE_PERMISSIONS) as [Role, string[]][]).flatMap(([role, keys]) =>
      keys.map((permission) => ({ role, permission: permission as never })),
    );
    await tx.insert(rolePermissions).values(rows);
  },
};

const staff: Seeder = {
  name: 'staff-users',
  run: async (tx, { staffPassword }) => {
    const passwordHash = await hashPassword(staffPassword);
    const rows = createSeed().staffUsers.map((u) => ({
      id: u.id,
      username: u.userId,
      name: u.name,
      role: u.role,
      departmentId: u.departmentId ?? null,
      email: u.email ?? null,
      mobile: u.mobile ?? null,
      passwordHash,
      status: u.active === false ? ('INACTIVE' as const) : ('ACTIVE' as const),
    }));
    // A reseed resets the demo staff to a known state (password, no TOTP, unlocked).
    await tx
      .insert(staffUsers)
      .values(rows)
      .onConflictDoUpdate({
        target: staffUsers.id,
        set: {
          username: sql`excluded.username`,
          name: sql`excluded.name`,
          role: sql`excluded.role`,
          departmentId: sql`excluded.department_id`,
          passwordHash: sql`excluded.password_hash`,
          status: sql`excluded.status`,
          totpSecret: null,
          totpEnabled: false,
          failedAttempts: 0,
          lockedUntil: null,
          mustChangePassword: false,
          updatedAt: sql`now()`,
        },
      });
  },
};

/** The demo applicants have only masked mobiles in @tgs/mock-data; their app mobile fills the X's with 0s. */
const applicantMobile = (masked: string) => masked.replaceAll('X', '0');

const apps: Seeder = {
  name: 'app-accounts',
  run: async (tx) => {
    const data = createSeed();
    const members = data.members
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => ({
        id: m.id,
        kind: 'MEMBER' as const,
        memberId: m.id,
        applicantId: null,
        generalNo: m.generalNo,
        employeeId: m.employeeId,
        name: m.name,
        mobile: m.mobile,
      }));
    const applicants = data.applicants.map((a) => ({
      id: a.id,
      kind: 'APPLICANT' as const,
      memberId: null,
      applicantId: a.id,
      generalNo: null,
      employeeId: null,
      name: a.name,
      mobile: applicantMobile(a.mobileMasked),
    }));
    await tx.delete(appAccounts);
    await tx.insert(appAccounts).values([...members, ...applicants]);
  },
};

export const authSeeders: Seeder[] = [permissions, staff, apps];
