import { sql } from 'drizzle-orm';
import { keepsAppAccess } from '@tgs/domain';
import { databaseFileStore } from '../../integrations/file-store';
import { files, staffUsers } from '../../models';
import { makeSignaturePng } from '../../common/utils/png';
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
      for (let i = 0; i < owners.length; i++) await store.put({ ownerId: owners[i]!, purpose: 'SIGNATURE', mime: 'image/png', bytes: png[i]!, width: 240, height: 80 }, tx);
    },
  },
];
