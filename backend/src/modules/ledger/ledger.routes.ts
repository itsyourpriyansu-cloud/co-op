import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../common/guards';
import { LedgerController } from './ledger.controller';
import {
  accountLedgerSchema,
  accountSchema,
  codeParams,
  idParams,
  journalPageSchema,
  journalSchema,
  journalsQuery,
  manualJournalBody,
  memberParams,
  memberStatementSchema,
  rangeQuery,
  reverseBody,
  trialBalanceQuery,
  trialBalanceSchema,
} from './ledger.schema';

/** The books (REQ-131, docs/22 P3). Read: ledger.view. Manual journals and reversals: ledger.post (Accountant). */
export const ledgerRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new LedgerController(app.ledger);
  const tags = ['ledger'];
  const security = [{ bearer: [] }];
  const view = requirePermission('ledger.view');
  const post = requirePermission('ledger.post', 'Only the Accountant can post to the books.');

  app.get('/ledger/accounts', { preHandler: view, schema: { tags, summary: 'Chart of accounts', security, response: { 200: z.array(accountSchema) } } }, controller.accounts);
  app.get('/ledger/trial-balance', { preHandler: view, schema: { tags, summary: 'Trial balance (debits must equal credits)', security, querystring: trialBalanceQuery, response: { 200: trialBalanceSchema } } }, controller.trialBalance);
  app.get('/ledger/accounts/:code/lines', { preHandler: view, schema: { tags, summary: "One account's lines with a running balance", security, params: codeParams, querystring: rangeQuery, response: { 200: accountLedgerSchema } } }, controller.accountLedger);
  app.get('/ledger/members/:memberId/statement', { preHandler: view, schema: { tags, summary: "A member's statement across loans, shares and deposits", security, params: memberParams, querystring: rangeQuery, response: { 200: memberStatementSchema } } }, controller.memberStatement);
  app.get('/ledger/journals', { preHandler: view, schema: { tags, summary: 'Journal entries, newest first', security, querystring: journalsQuery, response: { 200: journalPageSchema } } }, controller.journals);
  app.get('/ledger/journals/:id', { preHandler: view, schema: { tags, summary: 'One journal entry with its lines', security, params: idParams, response: { 200: journalSchema } } }, controller.journal);
  app.post('/ledger/journals', { preHandler: post, schema: { tags, summary: 'Post a manual journal (must balance)', security, body: manualJournalBody, response: { 200: journalSchema } } }, controller.postManual);
  app.post('/ledger/journals/:id/reverse', { preHandler: post, schema: { tags, summary: 'Reverse an entry (posts its mirror image)', security, params: idParams, body: reverseBody, response: { 200: journalSchema } } }, controller.reverse);
};
