import type { Paged } from '@tgs/types';
import { z } from 'zod';

/** Query-string list parameters shared by every list endpoint (docs/11 §1 ListParams). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z
    .string()
    .regex(/^[A-Za-z][\w.]*:(asc|desc)$/, 'Use field:asc or field:desc')
    .optional(),
  q: z.string().trim().max(100).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** SQL offset for a page. */
export function pageOffset({ page, pageSize }: Pick<ListQuery, 'page' | 'pageSize'>): number {
  return (page - 1) * pageSize;
}

export function toPaged<T>(items: T[], total: number, { page, pageSize }: Pick<ListQuery, 'page' | 'pageSize'>): Paged<T> {
  return { items, page, pageSize, total };
}
