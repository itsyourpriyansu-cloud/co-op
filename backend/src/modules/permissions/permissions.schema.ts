import { APP_ROLES, CONSOLE_ROLES } from '@tgs/types';
import { z } from 'zod';

export const ALL_ROLES = [...CONSOLE_ROLES, ...APP_ROLES] as const;

export const roleParamSchema = z.object({ role: z.enum(CONSOLE_ROLES) });

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(100),
});

export const permissionMatrixSchema = z.object({
  roles: z.array(z.object({ role: z.enum(ALL_ROLES), label: z.string() })),
  permissions: z.array(z.object({ key: z.string(), label: z.string(), group: z.string() })),
  grants: z.record(z.string(), z.array(z.string())),
});
