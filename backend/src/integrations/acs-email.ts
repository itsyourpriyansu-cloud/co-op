import { managedIdentityToken, type IdentityOptions } from './azure-identity';
import type { MessageSender } from './messaging';

/**
 * G5 (D-115): email through Azure Communication Services, signed in with the managed identity (no
 * access key). ACS accepts the message (202) and delivers it shortly after; a later bounce is not
 * tracked here.
 */
export interface AcsEmailOptions extends IdentityOptions {
  /** e.g. https://acs-tgseccsl-production.india.communication.azure.com */
  endpoint: string;
  from: string;
}

export function acsEmail({ endpoint, from, fetchImpl = fetch, ...identity }: AcsEmailOptions): MessageSender {
  const token = managedIdentityToken('https://communication.azure.com', { ...identity, fetchImpl });
  const url = `${endpoint.replace(/\/+$/, '')}/emails:send?api-version=2023-03-31`;
  return {
    async send(m) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ senderAddress: from, recipients: { to: [{ address: m.to }] }, content: { subject: m.title, plainText: `${m.body}\n\n— The Telangana Secretariat Employees Co-operative Credit Society Ltd.` } }),
      });
      if (res.status === 202) return { status: 'SENT', provider: 'acs-email' };
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      return { status: 'FAILED', provider: 'acs-email', error: `${res.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`.trim().slice(0, 300) };
    },
  };
}
