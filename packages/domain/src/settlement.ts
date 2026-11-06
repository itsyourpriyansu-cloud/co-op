// F-08 (D-098): a member's final settlement on retirement, resignation or death. Forms F5 / F6: what
// the member still owes at retirement or death is recovered from their gratuity.
import type { FinalSettlementStatement, ISODate, LoanProductCode, Paise } from '@tgs/types';
import { calculateAccruedInterest } from './loans';

export interface SettlementInput {
  exitDate: ISODate;
  loans: Array<{ id: string; loanNo: string; product: LoanProductCode; outstandingPrincipal: Paise; ratePercent: number; lastInterestChargedOn: ISODate }>;
  /** Penal owed today across the member's posted cycles. */
  penal: Paise;
  /** Unpaid demand heads other than loan principal and interest, by head (RRF, insurance, CRD, SRDS, share capital). */
  otherDues: Array<{ head: string; label: string; amount: Paise }>;
  /** Owed as a surety for other members' loans (F-13). */
  suretyDues: Array<{ recoveryId: string; label: string; amount: Paise }>;
  holds: {
    shareCapital: Paise;
    shareDeposit: Paise;
    crd: Paise;
    srds: Paise;
    /** Each FD at its payable value on the exit date (early-withdrawal rule, or the maturity value once matured). */
    fds: Array<{ id: string; label: string; principal: Paise; interest: Paise }>;
  };
}

const total = (xs: Array<{ amount: Paise }>) => xs.reduce((s, x) => s + x.amount, 0);

/**
 * F-08 [S] / [P] (D-098): what the member owes (each loan's outstanding principal plus interest to
 * the exit date, penal, other unpaid demand items, surety dues) against what the society holds for
 * them (share capital, share deposit, CRD / SRDS, FDs). Unpaid CRD / SRDS / share instalments are
 * owed and also held, so they net to nothing. `net` > 0 is paid to the member or the nominee; < 0
 * is recovered from the gratuity.
 */
export function finalSettlement(input: SettlementInput): FinalSettlementStatement {
  const loanLines = input.loans.flatMap((l) => {
    const interest = calculateAccruedInterest(l.outstandingPrincipal, l.ratePercent, l.lastInterestChargedOn, input.exitDate);
    return [
      { key: `loan:${l.id}:principal`, label: `${l.loanNo} · principal outstanding`, amount: l.outstandingPrincipal, loanId: l.id, product: l.product, part: 'PRINCIPAL' as const },
      ...(interest > 0 ? [{ key: `loan:${l.id}:interest`, label: `${l.loanNo} · interest to ${input.exitDate}`, amount: interest, loanId: l.id, product: l.product, part: 'INTEREST' as const }] : []),
    ];
  });
  const owes = [
    ...loanLines,
    ...(input.penal > 0 ? [{ key: 'penal', label: 'Penal interest', amount: input.penal }] : []),
    ...input.otherDues.filter((d) => d.amount > 0).map((d) => ({ key: `due:${d.head}`, label: `Unpaid ${d.label}`, amount: d.amount, head: d.head })),
    ...input.suretyDues.filter((d) => d.amount > 0).map((d) => ({ key: `surety:${d.recoveryId}`, label: d.label, amount: d.amount, recoveryId: d.recoveryId })),
  ];
  const unpaidOf = (head: string) => input.otherDues.find((d) => d.head === head)?.amount ?? 0;
  const h = input.holds;
  const holds = [
    { key: 'shareCapital', label: 'Share capital', amount: h.shareCapital + unpaidOf('SHARE_CAPITAL') },
    { key: 'shareDeposit', label: 'Share deposit', amount: h.shareDeposit },
    { key: 'crd', label: 'CRD balance', amount: h.crd + unpaidOf('CRD') },
    { key: 'srds', label: 'SRDS balance', amount: h.srds + unpaidOf('SRDS') },
    ...h.fds.map((f) => ({ key: `fd:${f.id}`, label: f.label, amount: f.principal + f.interest, fdId: f.id, principal: f.principal, interest: f.interest })),
  ].filter((x) => x.amount > 0);
  const totalOwed = total(owes);
  const totalHeld = total(holds);
  return { exitDate: input.exitDate, owes, holds, totalOwed, totalHeld, net: totalHeld - totalOwed };
}
