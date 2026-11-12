import { fileURLToPath } from 'node:url';
import { and, eq, ne, sql } from 'drizzle-orm';
import { checkPassword, ROLE_PERMISSIONS } from '@tgs/domain';
import { departments as DEPARTMENTS, LOAN_PRODUCTS, NOTIFICATION_TEMPLATES, SETTINGS, society } from '@tgs/mock-data';
import type { Role } from '@tgs/types';
import type { PgTable } from 'drizzle-orm/pg-core';
import { loadEnv } from '../config/env';
import { hashPassword } from '../common/utils/password';
import { CHART_OF_ACCOUNTS } from '../modules/ledger/ledger.accounts';
import { departments, ledgerAccounts, loanProductVersions, notificationTemplates, rolePermissions, settingsVersions, societyProfile, staffUsers, systemInfo } from '../models';
import { createDb, type Database } from './client';
import type { Tx } from './transaction';

/**
 * G3 (D-113): what a new production database needs before the first sign-in. Unlike the seed
 * (dev / test, fictional members), it only fills what is empty and never changes what the
 * society already edited, so it runs safely on every container start after the migrations.
 * Values are the placeholders of docs/09 (Settings shows them for the Admin to correct).
 */
export interface BootstrapAdmin {
  username: string;
  name: string;
  password: string;
}

export async function runBootstrap(db: Database | Tx, admin?: BootstrapAdmin): Promise<string[]> {
  const done: string[] = [];
  // Checked before anything is written, so a bad value stops the run cleanly.
  const username = admin?.username.trim().toLowerCase() ?? '';
  if (admin) {
    if (!/^[a-z0-9.]{3,40}$/.test(username)) throw new Error('BOOTSTRAP_ADMIN_USERNAME: 3 to 40 letters, digits or dots.');
    const check = checkPassword(admin.password, { employeeId: username });
    if (!check.ok) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD is too weak: ${check.checks.find((c) => !c.pass)?.message}`);
  }
  const empty = async (table: PgTable) => ((await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n ?? 0) === 0;

  // The chart grows with the code: new heads are added, existing ones are left as they are.
  const chart = await db
    .insert(ledgerAccounts)
    .values(CHART_OF_ACCOUNTS.map((a, i) => ({ ...a, sortOrder: i, description: a.description ?? null })))
    .onConflictDoNothing()
    .returning({ code: ledgerAccounts.code });
  if (chart.length) done.push(`chart of accounts (+${chart.length})`);

  // Migrations add single permission and template rows, so "empty" is not enough here. On the first
  // run every default is added; later runs skip this, so a permission the Admin removed stays removed.
  const [marker] = await db.select({ key: systemInfo.key }).from(systemInfo).where(eq(systemInfo.key, 'bootstrap'));
  if (!marker) {
    const rows = (Object.entries(ROLE_PERMISSIONS) as [Role, string[]][]).flatMap(([role, keys]) => keys.map((permission) => ({ role, permission: permission as never })));
    if ((await db.insert(rolePermissions).values(rows).onConflictDoNothing().returning({ role: rolePermissions.role })).length) done.push('role permissions');
  }
  if (await empty(settingsVersions)) {
    await db.insert(settingsVersions).values({ version: 1, status: 'ACTIVE', data: structuredClone(SETTINGS), summary: 'Initial values (placeholders, docs/09)' });
    done.push('settings v1');
  }
  if (await empty(loanProductVersions)) {
    await db.insert(loanProductVersions).values(LOAN_PRODUCTS.map((p) => ({ ...structuredClone(p), version: 1, status: 'ACTIVE' as const, summary: 'Initial values (placeholders, docs/09)' })));
    done.push('loan products v1');
  }
  if (await empty(societyProfile)) {
    await db.insert(societyProfile).values({ id: 'profile', ...society });
    done.push('society profile');
  }
  if (await empty(departments)) {
    // The DDO names in @tgs/mock-data are fictional (rule 8): the Admin enters the real ones.
    await db.insert(departments).values(DEPARTMENTS.map((d) => ({ ...d, ddoName: '' })));
    done.push('departments');
  }
  if (!marker && (await db.insert(notificationTemplates).values(structuredClone(NOTIFICATION_TEMPLATES)).onConflictDoNothing().returning({ key: notificationTemplates.key })).length) done.push('message templates');

  // The first Super Admin, only while there is no active one; must change the password on first sign-in.
  const [hasAdmin] = await db.select({ id: staffUsers.id }).from(staffUsers).where(and(eq(staffUsers.role, 'SUPER_ADMIN'), ne(staffUsers.status, 'INACTIVE'))).limit(1);
  if (!hasAdmin && admin) {
    await db
      .insert(staffUsers)
      .values({ id: `stf-${username.replace(/\./g, '-')}`, username, name: admin.name.trim() || 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await hashPassword(admin.password), status: 'ACTIVE', mustChangePassword: true })
      .onConflictDoNothing();
    done.push(`super admin ${username}`);
  } else if (!hasAdmin) {
    done.push('no super admin yet: set BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_NAME and BOOTSTRAP_ADMIN_PASSWORD and run again');
  }
  if (!marker) await db.insert(systemInfo).values({ key: 'bootstrap', value: { at: new Date().toISOString(), done } });
  return done;
}

// `npm run db:bootstrap -w @tgs/backend` (the container runs it after the migrations).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = loadEnv();
  const { BOOTSTRAP_ADMIN_USERNAME: username, BOOTSTRAP_ADMIN_NAME: name = '', BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  const handle = createDb({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL, max: 1 });
  handle.db
    .transaction((tx) => runBootstrap(tx, username && password ? { username, name, password } : undefined))
    .then((done) => console.log(done.length ? `Bootstrap: ${done.join(', ')}.` : 'Bootstrap: nothing to do.'))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => handle.close());
}
