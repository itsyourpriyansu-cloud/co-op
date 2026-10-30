import { z } from 'zod';
import { listQuerySchema } from '../../common/http/pagination';

const isoDate = z.iso.date();
const paise = z.number().int().nonnegative();
const accountType = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);

export const accountSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: accountType,
  normalSide: z.enum(['DEBIT', 'CREDIT']),
  memberLevel: z.boolean(),
  active: z.boolean(),
  description: z.string().optional(),
});

const entryBase = {
  id: z.string(),
  entryNo: z.string(),
  entryDate: isoDate,
  narration: z.string(),
  source: z.string(),
  sourceRef: z.string().optional(),
  reversesEntryId: z.string().optional(),
  total: paise,
  postedBy: z.string(),
  postedAt: z.string(),
};

export const entrySchema = z.object(entryBase);

export const journalSchema = z.object({
  ...entryBase,
  lines: z.array(
    z.object({
      lineNo: z.number().int(),
      accountCode: z.string(),
      accountName: z.string(),
      debit: paise,
      credit: paise,
      memberId: z.string().optional(),
      refType: z.string().optional(),
      refId: z.string().optional(),
    }),
  ),
  reversedBy: z.object({ id: z.string(), entryNo: z.string() }).optional(),
});

export const journalPageSchema = z.object({ items: z.array(entrySchema), page: z.number(), pageSize: z.number(), total: z.number() });

export const journalsQuery = listQuerySchema.pick({ page: true, pageSize: true }).extend({ from: isoDate.optional(), to: isoDate.optional(), source: z.string().optional() });

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), limit: z.coerce.number().int().min(1).max(2000).default(500) });

export const trialBalanceQuery = z.object({ asOf: isoDate.optional() });

export const trialBalanceSchema = z.object({
  asOf: isoDate,
  rows: z.array(z.object({ code: z.string(), name: z.string(), type: accountType, debit: paise, credit: paise, balance: z.number().int(), debitBalance: paise, creditBalance: paise })),
  totalDebit: paise,
  totalCredit: paise,
  balanced: z.boolean(),
});

export const accountLedgerSchema = z.object({
  account: z.object({ code: z.string(), name: z.string(), type: accountType }),
  openingBalance: z.number().int(),
  lines: z.array(z.object({ entryId: z.string(), entryNo: z.string(), entryDate: isoDate, narration: z.string(), debit: paise, credit: paise, balance: z.number().int(), memberId: z.string().optional() })),
  closingBalance: z.number().int(),
});

export const memberStatementSchema = z.object({
  memberId: z.string(),
  balances: z.array(z.object({ accountCode: z.string(), accountName: z.string(), balance: z.number().int() })),
  lines: z.array(
    z.object({
      entryId: z.string(),
      entryNo: z.string(),
      entryDate: isoDate,
      narration: z.string(),
      accountCode: z.string(),
      accountName: z.string(),
      debit: paise,
      credit: paise,
      balance: z.number().int(),
      refType: z.string().optional(),
      refId: z.string().optional(),
    }),
  ),
});

export const manualJournalBody = z.object({
  entryDate: isoDate.optional(),
  narration: z.string().trim().min(5, 'Say what the entry is for (at least 5 characters).').max(300),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(1),
        debit: paise.default(0),
        credit: paise.default(0),
        memberId: z.string().min(1).optional(),
      }),
    )
    .min(2)
    .max(200),
});

export const reverseBody = z.object({ reason: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) });
export const idParams = z.object({ id: z.uuid() });
export const codeParams = z.object({ code: z.string().min(1) });
export const memberParams = z.object({ memberId: z.string().min(1) });
