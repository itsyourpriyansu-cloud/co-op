import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../common/guards';

const ok = (name: string) => ({ 200: z.any().describe(`${name} (packages/types)`) });
const fy = z.string().regex(/^\d{4}(-\d{2})?$/, 'Use a year like 2026-27');

/** G2 (D-112): office vouchers, sub-heads and the year end. Read: ledger.view · vouchers, heads: ledger.post · year end: ledger.close. */
export const accountsRoutes: FastifyPluginAsyncZod = async (app) => {
  const s = app.accounts;
  const security = [{ bearer: [] }];
  const tags = ['accounts'];
  const view = requirePermission('ledger.view', 'The books are open to the Accountant and the office bearers.');
  const post = requirePermission('ledger.post', 'Only the Accountant writes vouchers and heads.');
  const close = requirePermission('ledger.close', 'Only the Accountant does the year-end work.');

  app.get('/accounts/heads', { onRequest: view, schema: { tags, summary: 'Chart of accounts with sub-heads', security, response: ok('LedgerHead[]') } }, () => s.heads());
  app.post('/accounts/heads', { onRequest: post, schema: { tags, summary: 'Add a sub-head under an income or expense head', security, body: z.object({ parentCode: z.string().min(1), name: z.string() }), response: { 201: z.any().describe('LedgerHead') } } }, async (r, reply) => reply.code(201).send(await s.addHead(r, r.body)));
  app.patch('/accounts/heads/:code', { onRequest: post, schema: { tags, summary: 'Rename or close a sub-head', security, params: z.object({ code: z.string().min(1) }), body: z.object({ name: z.string().optional(), active: z.boolean().optional() }), response: ok('LedgerHead') } }, (r) => s.updateHead(r, r.params.code, r.body));

  const voucherQuery = z.object({ from: z.string().optional(), to: z.string().optional(), kind: z.enum(['PAYMENT', 'RECEIPT']).optional(), page: z.coerce.number().int().optional(), pageSize: z.coerce.number().int().optional() });
  app.get('/accounts/vouchers', { onRequest: view, schema: { tags, summary: 'Office vouchers, newest first', security, querystring: voucherQuery, response: ok('OfficeVoucherList') } }, (r) => s.vouchers(r.query));
  app.get('/accounts/vouchers/:id', { onRequest: view, schema: { tags, summary: 'One office voucher', security, params: z.object({ id: z.string() }), response: ok('OfficeVoucher') } }, (r) => s.voucher(r.params.id));
  app.post(
    '/accounts/vouchers',
    {
      onRequest: post,
      schema: {
        tags,
        summary: 'Payment (expense) or receipt (other income) by cash or bank',
        security,
        body: z.object({ kind: z.enum(['PAYMENT', 'RECEIPT']), date: z.string().optional(), headCode: z.string(), amount: z.number(), mode: z.enum(['CASH', 'BANK']), reference: z.string().optional(), party: z.string(), narration: z.string() }),
        response: { 201: z.any().describe('OfficeVoucher') },
      },
    },
    async (r, reply) => reply.code(201).send(await s.createVoucher(r, r.body)),
  );

  app.get('/accounts/year-end', { onRequest: view, schema: { tags, summary: 'A financial year: income, expenses, surplus and what is done', security, querystring: z.object({ fy: fy.optional() }), response: ok('YearEndStatus') } }, (r) => s.yearEnd(r.query.fy));
  app.get('/accounts/year-end/interest', { onRequest: view, schema: { tags, summary: 'Annual interest on share deposit, CRD and SRDS: preview', security, querystring: z.object({ fy }), response: ok('InterestPreview') } }, (r) => s.interestPreview(r.query.fy));
  app.post('/accounts/year-end/interest', { onRequest: close, schema: { tags, summary: 'Credit the annual interest (once a year)', security, body: z.object({ fy }), response: ok('InterestPreview') } }, (r) => s.postInterest(r, r.body.fy));
  app.get('/accounts/year-end/dividend', { onRequest: view, schema: { tags, summary: 'Dividend on share capital: preview', security, querystring: z.object({ fy, rate: z.coerce.number().min(0).max(25).default(0) }), response: ok('DividendPreview') } }, (r) => s.dividendPreview(r.query.fy, r.query.rate));
  app.post('/accounts/year-end/dividend', { onRequest: close, schema: { tags, summary: 'Declare the dividend the general body approved', security, body: z.object({ fy, ratePercent: z.number(), resolution: z.string() }), response: ok('DividendPreview') } }, (r) => s.declareDividend(r, r.body));
  app.post('/accounts/year-end/dividend/pay', { onRequest: close, schema: { tags, summary: 'Pay the declared dividend from the bank', security, body: z.object({ fy }), response: ok('DividendPreview') } }, (r) => s.payDividend(r, r.body.fy));
  app.post('/accounts/year-end/close', { onRequest: close, schema: { tags, summary: 'Close the year: income and expenses to the surplus, then lock it', security, body: z.object({ fy }), response: ok('YearEndStatus') } }, (r) => s.closeYear(r, r.body.fy));
};
