import { retryableHttp, SEND_TIMEOUT_MS, type MessageSender } from './messaging';

/**
 * G5 (D-115): WhatsApp through Meta's Cloud API (F-10). Business-initiated messages must use templates
 * Meta has approved, so every society notice goes through one "notice" template with two values
 * (title, text), and one-time codes through an "authentication" template with a copy-code button.
 * Template names and language come from the environment, as the society registers them.
 */
export interface WhatsAppCloudOptions {
  phoneNumberId: string;
  token: string;
  apiVersion: string;
  noticeTemplate: string;
  otpTemplate: string;
  language: string;
  fetchImpl?: typeof fetch;
}

/** Indian 10-digit mobiles get the country code; anything else is sent as given (digits only). */
export const toWhatsAppNumber = (mobile: string) => {
  const digits = mobile.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

/** Template values may not hold new lines, tabs or more than four spaces in a row. */
const clean = (text: string, max = 1000) => text.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max);

export function whatsAppCloud({ phoneNumberId, token, apiVersion, noticeTemplate, otpTemplate, language, fetchImpl = fetch }: WhatsAppCloudOptions): MessageSender {
  return {
    async send(m) {
      const template = m.otp
        ? { name: otpTemplate, language: { code: language }, components: [{ type: 'body', parameters: [{ type: 'text', text: m.otp }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.otp }] }] }
        : { name: noticeTemplate, language: { code: language }, components: [{ type: 'body', parameters: [{ type: 'text', text: clean(m.title, 60) }, { type: 'text', text: clean(m.body) }] }] };
      const res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: toWhatsAppNumber(m.to), type: 'template', template }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
      if (res.ok && body.messages?.length) return { status: 'SENT', provider: 'whatsapp-cloud', providerMessageId: body.messages[0]!.id };
      // 130429 / 131048 / 131056: Meta's throughput and pair rate limits, worth a later try.
      const limited = [130429, 131048, 131056].includes(body.error?.code ?? 0);
      return { status: 'FAILED', provider: 'whatsapp-cloud', retryable: limited || retryableHttp(res.status), error: `${res.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`.trim().slice(0, 300) };
    },
  };
}
