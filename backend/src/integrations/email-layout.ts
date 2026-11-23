import type { SocietyProfile } from '@tgs/types';

/**
 * D-149: the one HTML frame every society email is sent in (header with the seal, a colour and
 * next step per kind of message, footer). Tables and inline styles only: that is what Gmail,
 * Outlook and phone mail apps all show the same way.
 */
export type EmailKind = 'LOAN' | 'DEPOSIT' | 'PAYMENT' | 'MEMBERSHIP' | 'ALERT' | 'NOTICE';

export interface EmailParts {
  kind: EmailKind;
  /** The person written to; "Member" when unknown. */
  name?: string;
  society: SocietyProfile;
}

/** The seal is attached to the email with this id (an inline image Gmail shows; data: URLs it blocks). */
export const SEAL_CID = 'tgs-seal';

const NAVY = '#003471';
const GOLD = '#D4A547';
const INK = '#0A1317';
const MUTED = '#5B6470';

const KINDS: Record<EmailKind, { label: string; accent: string; tint: string; next: string }> = {
  LOAN: { label: 'Loan update', accent: NAVY, tint: '#E8EEF7', next: 'Your loan, its repayment schedule and the sanction letter are in the TGSECCSL app under Loans.' },
  DEPOSIT: { label: 'Fixed deposit', accent: '#1F7A3A', tint: '#EAF5EC', next: 'Your deposit receipt (FDR) and maturity details are in the TGSECCSL app under Deposits.' },
  PAYMENT: { label: 'Payment', accent: '#8A6420', tint: '#FBF4E4', next: 'Every receipt and the breakup of each deduction are in the TGSECCSL app under Payments.' },
  MEMBERSHIP: { label: 'Membership', accent: '#0067CE', tint: '#E8F1FD', next: 'Follow your application and your profile in the TGSECCSL app.' },
  ALERT: { label: 'Important', accent: '#B3261E', tint: '#FCEDEC', next: 'If anything here is not right, contact the society office at once.' },
  NOTICE: { label: 'Society notice', accent: '#3E4C59', tint: '#EEF1F4', next: 'For details, open the TGSECCSL app or contact the society office.' },
};

/** Which kind a template is, from its key (`loan.sanctioned` → LOAN). Composer messages have none: NOTICE. */
export function emailKindOf(templateKey?: string | null): EmailKind {
  if (!templateKey) return 'NOTICE';
  if (templateKey === 'account.mobileChanged' || templateKey.startsWith('defaulter.') || templateKey.startsWith('surety.recovery')) return 'ALERT';
  if (templateKey.startsWith('loan.')) return 'LOAN';
  if (templateKey.startsWith('fd.')) return 'DEPOSIT';
  if (/^(receipt|payment|recovery|demand|dues)\./.test(templateKey)) return 'PAYMENT';
  if (/^(membership|profile|member)\./.test(templateKey)) return 'MEMBERSHIP';
  return 'NOTICE';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Amounts (₹1,00,000.00) and reference numbers (RCP-C-000123, FDR-2026-0007) stand out in bold. */
const highlight = (text: string) => esc(text).replace(/₹[\d,]+(?:\.\d{2})?|\b[A-Z]{2,4}(?:-[A-Z0-9]+)+\b/g, (m) => `<strong style="color:${INK};font-weight:700;white-space:nowrap">${m}</strong>`);

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function emailHtml(title: string, body: string, parts: EmailParts, opts: { sealCid?: string } = {}): string {
  const k = KINDS[parts.kind];
  const s = parts.society;
  const year = new Date().getFullYear();
  const seal = opts.sealCid
    ? `<img src="cid:${opts.sealCid}" width="72" height="72" alt="${esc(s.shortName)} seal" style="display:block;margin:0 auto;border:0;width:72px;height:72px">`
    : // shortcut: Azure email has no inline image here, so a gold text badge stands in for the seal; attach it when ACS inline attachments are wired.
      `<div style="margin:0 auto;width:72px;height:72px;line-height:72px;border-radius:36px;background:${GOLD};color:${NAVY};font:700 15px ${FONT};text-align:center">${esc(s.shortName.slice(0, 6))}</div>`;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font:400 16px/1.6 ${FONT};color:${INK}">${highlight(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F2F0EA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(body.slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F0EA" style="background:#F2F0EA">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E4E1D8">
  <tr><td bgcolor="${NAVY}" align="center" style="background:${NAVY};background-image:linear-gradient(160deg,#00285A 0%,${NAVY} 55%,#0B4A94 100%);padding:28px 24px 22px">
    ${seal}
    <div style="margin-top:12px;font:800 22px/1.2 ${FONT};letter-spacing:3px;color:${GOLD}">${esc(s.shortName)}</div>
    <div style="margin-top:6px;font:500 13px/1.45 ${FONT};color:#DCE6F4">${esc(s.name)}</div>
    <div style="margin-top:4px;font:400 12px/1.4 ${FONT};color:#9FB4D3">Regd. No. ${esc(s.registrationNo)}</div>
  </td></tr>
  <tr><td height="4" bgcolor="${GOLD}" style="background:${GOLD};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:28px 32px 8px">
    <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${k.tint};color:${k.accent};font:700 11px/1 ${FONT};letter-spacing:1.2px;text-transform:uppercase">${k.label}</span>
    <h1 style="margin:16px 0 18px;font:700 24px/1.3 ${FONT};color:${INK}">${esc(title)}</h1>
    <p style="margin:0 0 14px;font:400 16px/1.6 ${FONT};color:${INK}">Dear ${esc(parts.name?.trim() || 'Member')},</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="4" bgcolor="${k.accent}" style="background:${k.accent};border-radius:2px;font-size:0">&nbsp;</td>
      <td style="padding:2px 0 2px 16px">${paragraphs}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:8px 32px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${k.tint};border-radius:10px"><tr>
      <td style="padding:14px 16px;font:500 14px/1.5 ${FONT};color:${k.accent}">${esc(k.next)}</td>
    </tr></table>
    <p style="margin:22px 0 0;font:400 15px/1.6 ${FONT};color:${INK}">With regards,<br><strong>Society Office</strong><br>${esc(s.shortName)}</p>
  </td></tr>
  <tr><td bgcolor="#F7F5EF" style="background:#F7F5EF;border-top:1px solid #E4E1D8;padding:20px 32px 24px">
    <p style="margin:0 0 8px;font:600 13px/1.5 ${FONT};color:${NAVY}">${esc(s.name)}</p>
    <p style="margin:0 0 12px;font:400 12px/1.5 ${FONT};color:${MUTED}">${esc(s.address)}</p>
    <p style="margin:0 0 6px;font:400 12px/1.5 ${FONT};color:${MUTED}">This is an automated message from the society. Please do not reply to it; for help, use Help in the TGSECCSL app or visit the society office.</p>
    <p style="margin:0;font:400 12px/1.5 ${FONT};color:${MUTED}">Members can turn email updates on or off in the app under More &rsaquo; Settings &rsaquo; Where we reach you. &copy; ${year} ${esc(s.shortName)}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
