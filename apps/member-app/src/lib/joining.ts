// Joining data hooks + the member-facing view of the application stages (docs/10 §2, MJ-05).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDisplayDate } from '@tgs/domain';
import type { MembershipApplication, MembershipForm, MembershipStatus } from '@tgs/types';
import type { Stage } from '@/ui';
import { api } from './api';

export const joiningKeys = { reference: ['joining-reference'] as const, mine: ['membership-me'] as const };

export function useJoiningReference() {
  return useQuery({ queryKey: joiningKeys.reference, queryFn: api.joining.reference, staleTime: 60 * 60_000 });
}

export function useMyApplication() {
  // Polls so staff decisions in the console show up on the tracker without a manual refresh.
  return useQuery({ queryKey: joiningKeys.mine, queryFn: api.membership.me, refetchInterval: 5000 });
}

/** Autosave one section of the draft; keeps the cached application in sync. */
export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MembershipForm) => api.membership.saveDraft(patch),
    onSuccess: (app) => qc.setQueryData(joiningKeys.mine, app),
  });
}

/** The six stages an applicant sees (docs/10 §2 table). */
const ORDER: Array<{ key: string; title: string; statuses: MembershipStatus[]; current: string }> = [
  { key: 'received', title: 'Application received', statuses: ['SUBMITTED'], current: "You're in the queue. The society has your signed application." },
  { key: 'department', title: 'Department verification', statuses: ['DDO_CERTIFICATION'], current: 'Your department officer (DDO) is confirming your employment details.' },
  { key: 'office', title: 'Society office review', statuses: ['OFFICE_REVIEW'], current: 'The society office is checking your documents and declarations.' },
  { key: 'approval', title: 'Approval', statuses: ['APPROVAL_SECRETARY', 'APPROVAL_PRESIDENT'], current: 'Waiting for the Secretary and the President to approve.' },
  { key: 'shares', title: 'Pay for your shares', statuses: ['SHARE_PAYMENT_PENDING'], current: 'Approved! Pay for your shares to activate your membership.' },
  { key: 'welcome', title: 'Welcome to the society', statuses: ['ACTIVE'], current: 'Your General No. has been allotted.' },
];

/** Date the application first reached any of `statuses` (from the event log). */
function reachedOn(app: MembershipApplication, statuses: MembershipStatus[]): string | undefined {
  const e = app.events.find((ev) => statuses.includes(ev.toStatus as MembershipStatus));
  return e ? formatDisplayDate(e.at.slice(0, 10)) : undefined;
}

export function stagesFor(app: MembershipApplication): Stage[] {
  const status = app.status;
  // INFO_REQUESTED sits on the stage that asked for it; REJECTED on the stage where it stopped.
  const anchor: MembershipStatus =
    status === 'INFO_REQUESTED' ? (app.infoRequest?.by === 'DDO' ? 'DDO_CERTIFICATION' : 'OFFICE_REVIEW')
    : status === 'REJECTED' ? ((app.events.at(-1)?.fromStatus as MembershipStatus | undefined) ?? 'OFFICE_REVIEW')
    : status;
  const currentIdx = ORDER.findIndex((s) => s.statuses.includes(anchor));
  return ORDER.map((s, i) => {
    const date = reachedOn(app, s.statuses);
    if (i < currentIdx || (status === 'ACTIVE' && i === currentIdx)) {
      const signatures = s.key === 'approval' ? 'Approved by the Secretary and the President.' : undefined;
      return { key: s.key, title: s.title, status: 'done', date, description: signatures };
    }
    if (i === currentIdx) {
      if (status === 'INFO_REQUESTED') return { key: s.key, title: s.title, status: 'attention', date, description: 'Action needed: see the message above.' };
      if (status === 'REJECTED') return { key: s.key, title: s.title, status: 'failed', date, description: 'The application was not approved at this stage.' };
      const description = s.key === 'approval' ? (status === 'APPROVAL_PRESIDENT' ? 'Signed by the Secretary. Waiting for the President (2 of 2).' : 'Waiting for the Secretary (1 of 2).') : s.current;
      return { key: s.key, title: s.title, status: 'current', date, description };
    }
    return { key: s.key, title: s.title, status: 'todo' };
  });
}

/** Wizard steps and the form keys each one owns (for step-level validation). */
export const STEPS = [
  { key: 'personal', title: 'About you', prefixes: ['personal.'] },
  { key: 'address', title: 'Address', prefixes: ['address.'] },
  { key: 'employment', title: 'Employment', prefixes: ['employment.'] },
  { key: 'shares', title: 'Shares & nominee', prefixes: ['shares.', 'nominee.'] },
  { key: 'documents', title: 'Documents', prefixes: ['documents.'] },
  { key: 'agreements', title: 'Declarations', prefixes: ['declarations.'] },
  { key: 'review', title: 'Review & sign', prefixes: [] },
] as const;

export function errorsForStep(errors: Record<string, string>, step: number): Record<string, string> {
  const prefixes: readonly string[] = STEPS[step]?.prefixes ?? [];
  return Object.fromEntries(Object.entries(errors).filter(([k]) => prefixes.some((p) => k.startsWith(p))));
}

export function firstIncompleteStep(errors: Record<string, string>): number {
  const i = STEPS.findIndex((_, idx) => Object.keys(errorsForStep(errors, idx)).length > 0);
  return i === -1 ? STEPS.length - 1 : i;
}
