import { z } from 'zod';

// Members keep the mock API's shapes (docs/11) so the console works unchanged. Request bodies are
// checked field by field by @tgs/domain validateMemberInput (same messages as the mock), so the
// schemas here only fix the types; responses are the typed MemberList / MemberDetail.

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const memberListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().optional(),
  status: z.enum(['ACTIVE', 'RETIRED', 'RESIGNED', 'DECEASED', 'ALL']).optional(),
  retiringWithinMonths: z.coerce.number().int().min(0).max(600).optional(),
  hasActiveLoan: bool.optional(),
  mandatePending: bool.optional(),
  sort: z.enum(['generalNo', 'name', 'dor', 'outstanding']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const memberParams = z.object({ id: z.string().min(1) });

/** Loose on purpose: validateMemberInput returns per-field errors like the mock. */
export const memberInput = z.record(z.string(), z.unknown());

export const transferInput = z.object({
  toDepartmentId: z.string().optional(),
  effectiveDate: z.string().optional(),
  orderRef: z.string().max(80).optional(),
  remarks: z.string().max(300).optional(),
});

/** MemberList / MemberDetail (packages/types, checked by TypeScript) pass through as they are. */
export const memberListResponse = z.any().describe('MemberList (packages/types/src/api.ts)');
export const memberDetailResponse = z.any().describe('MemberDetail (packages/types/src/api.ts)');
