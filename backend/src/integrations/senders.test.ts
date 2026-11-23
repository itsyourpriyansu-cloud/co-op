import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../tests/helpers/test-app';
import { acsEmail } from './acs-email';
import { society } from '@tgs/mock-data';
import { SEAL_CID } from './email-layout';
import { EMAIL_FOOTER, smtpEmail } from './smtp-email';
import { toWhatsAppNumber, whatsAppCloud } from './whatsapp-cloud';

// G5 (D-115): the real WhatsApp and email senders, against a fake fetch (no message leaves).
type Call = { url: string; init: RequestInit };
const fakeFetch = (replies: Response[]) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => (calls.push({ url: String(url), init }), replies.shift() ?? new Response('{}', { status: 500 }))) as unknown as typeof fetch;
  return { f, calls, body: (i: number) => JSON.parse(String(calls[i]!.init.body)) };
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('WhatsApp Cloud API sender', () => {
  const opts = { phoneNumberId: '1234', token: 'tok', apiVersion: 'v21.0', noticeTemplate: 'society_notice', otpTemplate: 'login_code', language: 'en' };

  it('sends a notice with the notice template, and a code with the authentication template', async () => {
    const { f, calls, body } = fakeFetch([json(200, { messages: [{ id: 'wamid.1' }] }), json(200, { messages: [{ id: 'wamid.2' }] })]);
    const s = whatsAppCloud({ ...opts, fetchImpl: f });
    expect(await s.send({ channel: 'WHATSAPP', to: '98765 43210', title: 'Loan sanctioned', body: 'Line one\nline two' })).toEqual({ status: 'SENT', provider: 'whatsapp-cloud', providerMessageId: 'wamid.1' });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/1234/messages');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(body(0)).toMatchObject({ messaging_product: 'whatsapp', to: '919876543210', type: 'template', template: { name: 'society_notice', components: [{ parameters: [{ text: 'Loan sanctioned' }, { text: 'Line one line two' }] }] } });

    await s.send({ channel: 'WHATSAPP', to: '9876543210', title: 'x', body: 'x', otp: '482913' });
    expect(body(1).template).toMatchObject({ name: 'login_code', components: [{ type: 'body', parameters: [{ text: '482913' }] }, { type: 'button', parameters: [{ text: '482913' }] }] });
  });

  it('reports a refusal as FAILED with the reason', async () => {
    const { f } = fakeFetch([json(400, { error: { code: 131026, message: 'Message undeliverable' } })]);
    const r = await whatsAppCloud({ ...opts, fetchImpl: f }).send({ channel: 'WHATSAPP', to: '9876543210', title: 't', body: 'b' });
    expect(r).toEqual({ status: 'FAILED', provider: 'whatsapp-cloud', retryable: false, error: '400 131026 Message undeliverable' });
    expect(toWhatsAppNumber('+91 98765-43210')).toBe('919876543210');
  });
});

describe('Azure Communication Services email sender', () => {
  it('signs in with the managed identity once, then sends; a refusal is FAILED', async () => {
    const { f, calls, body } = fakeFetch([json(200, { access_token: 'mi-token', expires_on: Math.floor(Date.now() / 1000) + 3600 }), new Response(null, { status: 202 }), json(400, { error: { code: 'InvalidSender', message: 'bad from' } })]);
    const s = acsEmail({ endpoint: 'https://acs.example.communication.azure.com/', from: 'DoNotReply@society.in', env: { IDENTITY_ENDPOINT: 'http://id.local', IDENTITY_HEADER: 'h' }, fetchImpl: f });
    expect(await s.send({ channel: 'EMAIL', to: 'member@example.com', title: 'Receipt', body: 'Paid' })).toEqual({ status: 'SENT', provider: 'acs-email' });
    expect(calls[0]!.url).toContain('resource=https%3A%2F%2Fcommunication.azure.com');
    expect(calls[1]!.url).toBe('https://acs.example.communication.azure.com/emails:send?api-version=2023-03-31');
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer mi-token');
    expect(body(1)).toMatchObject({ senderAddress: 'DoNotReply@society.in', recipients: { to: [{ address: 'member@example.com' }] }, content: { subject: 'Receipt' } });

    expect(await s.send({ channel: 'EMAIL', to: 'member@example.com', title: 'x', body: 'x' })).toEqual({ status: 'FAILED', provider: 'acs-email', retryable: false, error: '400 InvalidSender bad from' });
    expect(calls).toHaveLength(3); // the token was reused
  });
});

describe('one-time codes that cannot be sent (G5)', () => {
  let app: FastifyInstance;
  beforeAll(async () => (app = await buildTestApp()));
  afterAll(() => app.close());

  it('are refused clearly instead of leaving the member waiting', async () => {
    const original = app.notifications.senders.WHATSAPP;
    let seen: { otp?: string } | undefined;
    app.notifications.senders.WHATSAPP = { send: async (m) => ((seen = m), { status: 'FAILED', provider: 'test', error: 'down' }) };
    try {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/start', payload: { mobile: '9000000001', purpose: 'SIGNUP' } });
      expect(res.json()).toMatchObject({ code: 'RULE_VIOLATION', ruleId: 'OTP_NOT_SENT' });
      expect(seen?.otp).toMatch(/^\d{6}$/);
    } finally {
      app.notifications.senders.WHATSAPP = original;
    }
  });
});

describe('SMTP email sender (D-146)', () => {
  const opts = { host: 'smtp.example.org', port: 465, secure: true, user: 'office@example.org', password: 'x', from: 'TGSECCSL <office@example.org>' };
  it('sends the subject and text with the society footer; a temporary refusal is retried, a hard one is not', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const replies: Array<Error & { responseCode?: number }> = [Object.assign(new Error('busy'), { responseCode: 421 }), Object.assign(new Error('no such user'), { responseCode: 550 })];
    const transport = { sendMail: async (mail: Record<string, unknown>) => (sent.length ? Promise.reject(replies.shift()) : (sent.push(mail), { messageId: '<m1@example.org>' })) } as never;
    const s = smtpEmail({ ...opts, transport });
    expect(await s.send({ channel: 'EMAIL', to: 'member@example.com', title: 'FD accepted', body: 'FD 12 is active.' })).toEqual({ status: 'SENT', provider: 'smtp', providerMessageId: '<m1@example.org>' });
    expect(sent[0]).toMatchObject({ from: opts.from, to: 'member@example.com', subject: 'FD accepted' });
    expect(sent[0]!.text).toBe('FD 12 is active.' + EMAIL_FOOTER);
    expect(await s.send({ channel: 'EMAIL', to: 'a@b.c', title: 'x', body: 'x' })).toMatchObject({ status: 'FAILED', retryable: true });
    expect(await s.send({ channel: 'EMAIL', to: 'a@b.c', title: 'x', body: 'x' })).toMatchObject({ status: 'FAILED', retryable: false, error: '550 no such user' });
  });

  it('sends the HTML layout with the seal attached inline when the message has its email parts (D-149)', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const s = smtpEmail({ ...opts, transport: { sendMail: async (mail: Record<string, unknown>) => (sent.push(mail), { messageId: '<m2@example.org>' }) } as never });
    await s.send({ channel: 'EMAIL', to: 'member@example.com', title: 'Loan repaid', body: 'Loan OL-1 is closed.', email: { kind: 'LOAN', name: 'Ravi', society } });
    expect(String(sent[0]!.html)).toContain(`cid:${SEAL_CID}`);
    expect(sent[0]!.attachments).toEqual([expect.objectContaining({ cid: SEAL_CID, contentType: 'image/png' })]);
    expect(sent[0]!.text).toBe('Loan OL-1 is closed.' + EMAIL_FOOTER);
  });
});
