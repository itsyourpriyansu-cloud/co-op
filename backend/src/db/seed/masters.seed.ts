import { demoDataset } from './dataset';
import { departments, loanProductVersions, notificationTemplates, settingsVersions, societyProfile } from '../../models';
import type { Seeder } from '.';

// P2 seeders (docs/22 §5): version 1 of every master from the demo dataset, so the backend and the
// mock API start from the same values. A reseed (dev / demo reset) replaces all versions.

const masters: Seeder = {
  name: 'masters',
  run: async (tx) => {
    const data = demoDataset();
    await tx.delete(loanProductVersions);
    await tx.delete(settingsVersions);
    await tx.delete(societyProfile);
    await tx.delete(departments);
    await tx.delete(notificationTemplates);

    await tx.insert(settingsVersions).values({ version: 1, status: 'ACTIVE', data: data.settings, summary: 'Initial values (demo dataset)' });
    await tx.insert(loanProductVersions).values(
      data.loanProducts.map((p) => ({ ...p, version: 1, status: 'ACTIVE' as const, summary: 'Initial values (demo dataset)' })),
    );
    await tx.insert(societyProfile).values({ id: 'profile', ...data.society });
    await tx.insert(departments).values(data.departments);
    await tx.insert(notificationTemplates).values(data.notificationTemplates);
  },
};

export const masterSeeders: Seeder[] = [masters];
