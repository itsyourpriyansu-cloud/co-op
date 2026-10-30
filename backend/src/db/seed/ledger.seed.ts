import { checkJournal, type JournalLineInput } from '@tgs/domain';
import { sql } from 'drizzle-orm';
import { journalEntries, journalLines, ledgerAccounts } from '../../models';
import { ACCOUNT, CHART_OF_ACCOUNTS, DEPOSIT_ACCOUNT, LOAN_ACCOUNT } from '../../modules/ledger/ledger.accounts';
import { demoDataset } from './dataset';
import type { Seeder } from '.';

// P3 seeders (docs/22 §5.3): the chart of accounts [P] and opening balances brought in from the demo
// dataset, one entry per member, so statements and the trial balance have real figures. In
// production the same OPENING entries come from the society's registers (P9 import, F-11).

const chart: Seeder = {
  name: 'ledger-chart',
  run: async (tx) => {
    // The books are append-only (UPDATE/DELETE refused); a dev/demo reseed starts them afresh.
    await tx.execute(sql`truncate ${journalLines}, ${journalEntries} restart identity`);
    await tx.delete(ledgerAccounts);
    await tx.insert(ledgerAccounts).values(CHART_OF_ACCOUNTS.map((a, i) => ({ ...a, sortOrder: i, description: a.description ?? null })));
  },
};

const opening: Seeder = {
  name: 'ledger-opening-balances',
  run: async (tx) => {
    const data = demoDataset();
    const lines = new Map<string, JournalLineInput[]>();
    const add = (memberId: string, l: Omit<JournalLineInput, 'memberId'>) => {
      if (l.debit <= 0 && l.credit <= 0) return;
      if (!lines.has(memberId)) lines.set(memberId, []);
      lines.get(memberId)!.push({ ...l, memberId });
    };
    for (const s of data.shareAccounts) {
      add(s.memberId, { accountCode: ACCOUNT.SHARE_CAPITAL, debit: 0, credit: s.shareCapital, refType: 'SHARE', refId: s.memberId });
      add(s.memberId, { accountCode: ACCOUNT.SHARE_DEPOSIT, debit: 0, credit: s.shareDepositBalance, refType: 'SHARE', refId: s.memberId });
    }
    for (const l of data.loans.filter((x) => x.status === 'ACTIVE')) {
      add(l.memberId, { accountCode: LOAN_ACCOUNT[l.product], debit: l.outstandingPrincipal, credit: 0, refType: 'LOAN', refId: l.id });
    }
    for (const d of data.deposits.filter((x) => x.status === 'ACTIVE' || x.status === 'MATURED')) {
      add(d.memberId, { accountCode: DEPOSIT_ACCOUNT[d.scheme], debit: 0, credit: d.balance, refType: 'DEPOSIT', refId: d.id });
    }

    for (const [memberId, memberLines] of lines) {
      const debit = memberLines.reduce((s, l) => s + l.debit, 0);
      const credit = memberLines.reduce((s, l) => s + l.credit, 0);
      // The other side of what members owe and are owed: cash and bank in the old books.
      if (debit !== credit) {
        memberLines.push({ accountCode: ACCOUNT.OPENING_DIFFERENCE, debit: Math.max(credit - debit, 0), credit: Math.max(debit - credit, 0) });
      }
      if (memberLines.length < 2) continue;
      const check = checkJournal(memberLines);
      if (!check.ok) throw new Error(`Opening entry for ${memberId} does not balance: ${JSON.stringify(check.errors)}`);
      const [entry] = await tx
        .insert(journalEntries)
        .values({ entryDate: data.today, narration: `Opening balances brought forward (${memberId})`, source: 'OPENING', sourceRef: memberId, total: check.totalDebit, postedBy: 'system', postedByName: 'Opening balances' })
        .returning({ id: journalEntries.id });
      await tx.insert(journalLines).values(
        memberLines.map((l, i) => ({ entryId: entry!.id, lineNo: i + 1, accountCode: l.accountCode, debit: l.debit, credit: l.credit, memberId: l.accountCode === ACCOUNT.OPENING_DIFFERENCE ? null : (l.memberId ?? null), refType: l.refType ?? null, refId: l.refId ?? null })),
      );
    }
  },
};

export const ledgerSeeders: Seeder[] = [chart, opening];
