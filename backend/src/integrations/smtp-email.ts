import { readFileSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import { emailHtml, SEAL_CID } from './email-layout';
import { SEND_TIMEOUT_MS, type MessageSender } from './messaging';

/**
 * D-146: email through any SMTP server (Gmail with an app password now, the society's own domain
 * mail later), so email works on any host, not only Azure.
 */
export interface SmtpEmailOptions {
  host: string;
  port: number;
  /** true = TLS from the start (port 465); false = STARTTLS (port 587). */
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Tests pass a fake transport. */
  transport?: Pick<Transporter, 'sendMail'>;
}

export const EMAIL_FOOTER = '\n\n— The Telangana Secretariat Employees Co-operative Credit Society Ltd.';

/** D-149: the society seal (144 px, 7 KB), attached to each HTML email and shown inline in its header. */
const SEAL = readFileSync(new URL('./assets/email-seal.png', import.meta.url));

/** SMTP reply codes 4xx are temporary (try again); 5xx are a refusal of this message. */
const retryableSmtp = (err: { responseCode?: number; code?: string }) => (err.responseCode ? err.responseCode < 500 : true);

export function smtpEmail({ host, port, secure, user, password, from, transport }: SmtpEmailOptions): MessageSender {
  const mailer = transport ?? nodemailer.createTransport({ host, port, secure, auth: { user, pass: password }, connectionTimeout: SEND_TIMEOUT_MS, greetingTimeout: SEND_TIMEOUT_MS, socketTimeout: SEND_TIMEOUT_MS });
  return {
    async send(m) {
      try {
        const html = m.email ? { html: emailHtml(m.title, m.body, m.email, { sealCid: SEAL_CID }), attachments: [{ filename: 'seal.png', content: SEAL, contentType: 'image/png', cid: SEAL_CID }] } : {};
        const info = await mailer.sendMail({ from, to: m.to, subject: m.title, text: `${m.body}${EMAIL_FOOTER}`, ...html });
        return { status: 'SENT', provider: 'smtp', ...(info.messageId ? { providerMessageId: info.messageId } : {}) };
      } catch (e) {
        const err = e as Error & { responseCode?: number; code?: string };
        return { status: 'FAILED', provider: 'smtp', retryable: retryableSmtp(err), error: `${err.responseCode ?? err.code ?? ''} ${err.message}`.trim().slice(0, 300) };
      }
    },
  };
}
