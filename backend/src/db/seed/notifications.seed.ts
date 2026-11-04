import { sql } from 'drizzle-orm';
import { deliveries, messages, notifications, supportTickets } from '../../models';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P8a (docs/22 §5.7): the demo's notifications and member questions. Notifications have no
// member foreign key (staff get them too), so they are emptied here; tickets and preferences go
// with the masters seeder's `truncate departments cascade`.
export const notificationSeeders: Seeder[] = [
  {
    name: 'notifications',
    run: async (tx) => {
      const d = demoDataset();
      await tx.execute(sql`truncate ${notifications}, ${deliveries}, ${messages}`);
      for (let i = 0; i < d.notifications.length; i += 500)
        await tx.insert(notifications).values(d.notifications.slice(i, i + 500).map((n) => ({ id: n.id, recipientId: n.recipientId, title: n.title, body: n.body, link: n.link ?? null, read: n.read, createdAt: n.createdAt })));
      if (d.supportTickets.length) await tx.insert(supportTickets).values(d.supportTickets.map((t) => ({ id: t.id, memberId: t.memberId, status: t.status, updatedAt: t.updatedAt ?? t.createdAt, data: t })));
    },
  },
];
