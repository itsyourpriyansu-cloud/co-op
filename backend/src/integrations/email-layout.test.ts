import { NOTIFICATION_TEMPLATES, society } from '@tgs/mock-data';
import { describe, expect, it } from 'vitest';
import { emailHtml, emailKindOf, SEAL_CID } from './email-layout';

// D-149: the one HTML frame of every society email.
describe('email layout', () => {
  it('gives every message template a kind; only composed and staff messages are plain notices', () => {
    expect(emailKindOf('loan.repaid')).toBe('LOAN');
    expect(emailKindOf('fd.accepted')).toBe('DEPOSIT');
    expect(emailKindOf('receipt.issued')).toBe('PAYMENT');
    expect(emailKindOf('membership.stage')).toBe('MEMBERSHIP');
    expect(emailKindOf('account.mobileChanged')).toBe('ALERT');
    expect(emailKindOf('surety.recoveryBorrower')).toBe('ALERT');
    expect(emailKindOf(undefined)).toBe('NOTICE');
    const plain = NOTIFICATION_TEMPLATES.filter((t) => t.audience !== 'STAFF' && emailKindOf(t.key) === 'NOTICE').map((t) => t.key);
    expect(plain).toEqual([]);
  });

  it('has the seal, society, greeting and kind; escapes the text and bolds amounts and reference numbers', () => {
    const html = emailHtml('Receipt RCP-C-000123', 'We received ₹1,00,000.00 for <test>.\n\nThank you.', { kind: 'PAYMENT', name: 'Asha & Co', society }, { sealCid: SEAL_CID });
    expect(html).toContain(`src="cid:${SEAL_CID}"`);
    expect(html).toContain(society.name);
    expect(html).toContain(`Regd. No. ${society.registrationNo}`);
    expect(html).toContain('Dear Asha &amp; Co,');
    expect(html).toContain('>Payment</span>');
    expect(html).toContain('&lt;test&gt;');
    expect(html).not.toContain('<test>');
    expect(html).toMatch(/<strong[^>]*>₹1,00,000\.00<\/strong>/);
    expect(html.match(/<p style="margin:0 0 14px/g)).toHaveLength(3); // greeting + two paragraphs
  });

  it('without an inline seal (Azure email) shows a text badge and greets "Member"', () => {
    const html = emailHtml('Notice', 'Hello all.', { kind: 'NOTICE', society });
    expect(html).not.toContain('cid:');
    expect(html).toContain('Dear Member,');
  });
});
