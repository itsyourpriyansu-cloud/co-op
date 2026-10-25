// Money helpers. All amounts are integer paise (D-018); formatting is done by hand
// so web (V8) and Android (Hermes) render identical Indian-grouped strings.
import type { Paise } from '@tgs/types';

export function toPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

/** "1234567" → "12,34,567" (Indian digit grouping). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** ₹1,25,000 (summaries) or ₹1,25,000.00 (ledgers, `decimals: 2`). */
export function formatINR(paise: Paise, opts: { decimals?: 0 | 2 } = {}): string {
  const decimals = opts.decimals ?? 0;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  let rupees = Math.floor(abs / 100);
  let fraction = abs % 100;
  if (decimals === 0 && fraction >= 50) {
    rupees += 1;
    fraction = 0;
  }
  const body =
    groupIndian(String(rupees)) + (decimals === 2 ? '.' + String(fraction).padStart(2, '0') : '');
  return (negative ? '-₹' : '₹') + body;
}

/** KPI style: ₹4.52 Cr, ₹18.6 L, else full amount. */
export function formatINRCompact(paise: Paise): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${trimZeros((abs / 1_00_00_000).toFixed(2))} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trimZeros((abs / 1_00_000).toFixed(1))} L`;
  return formatINR(paise);
}

/** Input always comes from toFixed(), so it has a decimal point: "18.60" → "18.6", "5.00" → "5". */
function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, '');
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  // n < 100, so every index is in range.
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  const ones = ONES[n % 10]!;
  return ones ? `${tens} ${ones}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(' ');
}

/** Indian-system words: 125000 → "One Lakh Twenty Five Thousand". */
export function numberToIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError('numberToIndianWords expects a non-negative integer');
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only" (paper forms: amount in words). */
export function amountInWords(paise: Paise): string {
  if (paise < 0) throw new RangeError('amountInWords expects a non-negative amount');
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const words = `Rupees ${numberToIndianWords(rupees)}`;
  return p ? `${words} and ${belowHundred(p)} Paise Only` : `${words} Only`;
}
