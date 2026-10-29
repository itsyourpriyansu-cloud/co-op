import { CONSOLE_ROLES } from '@tgs/types';
import { z } from 'zod';

/** ST-61 row: same shape as the mock API's StaffUser, so the console screen works unchanged. */
export const staffUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  role: z.enum(CONSOLE_ROLES),
  departmentId: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  active: z.boolean(),
  /** Backend extras the console can show from P1b. */
  totpEnabled: z.boolean(),
  locked: z.boolean(),
  lastLoginAt: z.string().optional(),
});

export const staffUserListSchema = z.array(staffUserSchema);

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

export const staffUserInput = z
  .object({
    name: z.string().trim().min(1, 'Enter the full name.').max(80),
    userId: z.string().trim().regex(/^[a-z0-9.]{3,24}$/, 'Use 3–24 lowercase letters, digits or dots.'),
    role: z.enum(CONSOLE_ROLES, 'Choose a role.'),
    departmentId: optionalText,
    email: optionalText.pipe(z.email('Enter a valid email.').optional()),
    mobile: optionalText.pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number.').optional()),
    active: z.boolean().optional(),
  })
  .refine((u) => u.role !== 'DDO' || Boolean(u.departmentId), { path: ['departmentId'], message: 'A DDO needs a department.' });

export const userIdParam = z.object({ id: z.string().min(1) });

export const temporaryPasswordSchema = z.object({
  userId: z.string(),
  temporaryPassword: z.string(),
  /** The user must choose a new password at the next sign-in. */
  mustChangePassword: z.literal(true),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password').max(200),
});
