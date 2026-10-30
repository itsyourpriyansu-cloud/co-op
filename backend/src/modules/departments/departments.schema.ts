import { z } from 'zod';

export const departmentRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(['SECRETARY_DEPT', 'EXTERNAL_OFFICE']),
  ddoName: z.string(),
  ddoDesignation: z.string(),
  memberCount: z.number().int(),
  ddoUserId: z.string().optional(),
});

export const departmentListSchema = z.array(departmentRowSchema);

/** Partial: the service merges with the current record and returns field errors like the mock. */
export const departmentInput = departmentRowSchema.pick({ code: true, name: true, kind: true, ddoName: true, ddoDesignation: true }).partial();

export const departmentParams = z.object({ id: z.string().min(1) });
