// Helpers shared by every route module: permission checks, audit entries, notifications.
import type { Hono, MiddlewareHandler } from 'hono';
import type { AppNotification, NotificationChannel, Permission, SessionUser } from '@tgs/types';
import { nowIso } from './clock';
import { fail } from './errors';
import { permissionsFor } from './permissions';
import type { Store } from './store';

export type Env = { Variables: { session: SessionUser; token: string } };
export type Api = Hono<Env>;
export type Guard = MiddlewareHandler<Env>;

/** Business timestamps follow the demo date (D-065). */
export { nowIso };

export function can(user: SessionUser, permission: Permission): boolean {
  return permissionsFor(user.role).includes(permission);
}

export function requirePermission(user: SessionUser, permission: Permission, message = 'You do not have access to this.'): void {
  if (!can(user, permission)) fail('FORBIDDEN', message);
}

/** Staff-only routes. Members and applicants use their own `/me/*` endpoints. */
export function requireStaff(user: SessionUser): void {
  if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
}

/** Members only (Member App). */
export function requireMember(user: SessionUser): string {
  if (user.role !== 'MEMBER' || !user.memberId) fail('FORBIDDEN', 'Members only.');
  return user.memberId;
}

export function audit(store: Store, user: SessionUser, entity: string, entityId: string, action: string, summary: string): void {
  const log = store.db.auditLog;
  log.unshift({ id: `aud-${log.length + 1}-${Date.now().toString(36)}`, at: nowIso(), actorId: user.id, actorName: user.name, entity, entityId, action, summary });
  if (log.length > 500) log.length = 500;
}

/**
 * Sends a templated notification (ST-63). In-app is stored for the recipient; other channels are
 * simulated (listed on the notification so the demo can show "sent by SMS / WhatsApp").
 */
export function notify(store: Store, recipientId: string, templateKey: string, vars: Record<string, string | number>, link?: string): AppNotification | undefined {
  const t = store.db.notificationTemplates.find((x) => x.key === templateKey);
  if (!t) return undefined;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  const n: AppNotification & { alsoSentVia?: NotificationChannel[] } = {
    id: `ntf-${store.db.notifications.length + 1}-${Date.now().toString(36)}`,
    recipientId,
    title: fill(t.title),
    body: fill(t.body),
    channel: 'IN_APP',
    createdAt: nowIso(),
    read: false,
    ...(link ? { link } : {}),
    alsoSentVia: t.channels.filter((c) => c !== 'IN_APP'),
  };
  store.db.notifications.unshift(n);
  return n;
}
