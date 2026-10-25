// ST-24 … ST-28 in one side drawer: review (checklist), DDO certificate (or the accountant's record of
// an offline one), assessment = "For Office Use" sanction sheet, Secretary → President sanction, and
// disbursement. The server re-validates everything; the drawer only guides.
import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type, Checkbox, CheckboxSize, SnackbarV2Variant, TextAreaV2, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatCycle, formatDisplayDate, formatDisplayDateTime } from '@tgs/domain';
import type { LoanActionInput, LoanDetail, SanctionSheet } from '@tgs/types';
import { MoneyField, NumberField, TextField } from '@/components/Form';
import { Money } from '@/components/Money';
import { RuleCheckList } from '@/components/RuleCheckList';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ACTION_LABEL } from './loans';

const NEEDS_REASON = new Set(['returnToMember', 'reject', 'sendBack']);

const TITLES: Record<string, { title: string; description: string }> = {
  forward: { title: 'Review application', description: 'Confirm the details and documents. The eligibility checks run again automatically.' },
  ddoCertify: { title: 'DDO certificate (items 1–5)', description: 'Confirm the particulars against the service register and that the loan can be recovered from salary.' },
  ddoRecordManual: { title: 'Record DDO certificate', description: 'For a certificate received on paper (Q-102). Enter the DDO and the letter details.' },
  sendForSanction: { title: 'Assessment · For Office Use', description: 'The sanction sheet is computed from the rules. You may reduce the amount or tenure.' },
  secretarySign: { title: 'Sanction (1 of 2)', description: 'Your signature sends the loan to the President.' },
  presidentSign: { title: 'Sanction (2 of 2)', description: 'Final sanction. The sanction letter is generated and the member is told.' },
  disburse: { title: 'Disburse', description: 'Record the payment. The loan becomes active and the repayment schedule starts.' },
  returnToMember: { title: 'Return to the member', description: 'The member sees your reason in the app, corrects the application and signs again.' },
  reject: { title: 'Reject application', description: 'This ends the application. The member sees your reason.' },
  sendBack: { title: 'Send back to assessment', description: 'The Accountant re-assesses; both signatures are needed again.' },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-body text-fg-secondary">{label}</span>
      <span className={cn('text-right', strong ? 'text-label text-fg' : 'text-body text-fg')}>{children}</span>
    </div>
  );
}

/** The "For Office Use" block (F2/F3 back) — shared by assessment and both sanction steps. */
export function SanctionSheetView({ sheet }: { sheet: SanctionSheet }) {
  return (
    <div className="divide-y divide-line-subtle rounded-card border border-line px-4 py-2">
      <div className="py-1">
        <Row label="OL balance">
          <Money value={sheet.balances.ordinary} />
          {sheet.balances.ordinaryTakenOn ? <span className="text-caption text-fg-tertiary"> · taken {formatDisplayDate(sheet.balances.ordinaryTakenOn)}</span> : null}
        </Row>
        <Row label="SL balance">
          <Money value={sheet.balances.salary} />
          {sheet.balances.salaryTakenOn ? <span className="text-caption text-fg-tertiary"> · taken {formatDisplayDate(sheet.balances.salaryTakenOn)}</span> : null}
        </Row>
      </div>
      <div className="py-1">
        <Row label="Sanction amount" strong>
          <Money value={sheet.amount} />
        </Row>
        <p className="pb-1 text-right text-caption text-fg-tertiary">{amountInWords(sheet.amount)}</p>
        <Row label="Instalments">{`${sheet.instalments} × from ${formatCycle(sheet.firstDueCycle)} at ${sheet.ratePercent}%`}</Row>
        <Row label="EMI (first → last)">
          <Money value={sheet.emi} />
          {sheet.lastEmi !== sheet.emi ? (
            <>
              {' → '}
              <Money value={sheet.lastEmi} />
            </>
          ) : null}
        </Row>
        <Row label="Total interest">
          <Money value={sheet.totalInterest} />
        </Row>
      </div>
      <div className="py-1">
        {sheet.topup && (
          <>
            <Row label={`Settles ${sheet.topup.loanNo}: principal`}>
              <Money value={sheet.topup.outstandingPrincipal} />
            </Row>
            <Row label="Interest to date (BR-007)">
              <Money value={sheet.topup.accruedInterest} />
            </Row>
          </>
        )}
        <Row label="Share deposit deduction (BR-004)">
          <Money value={sheet.shareDeduction} />
        </Row>
        <Row label="Net disbursable" strong>
          <Money value={sheet.netDisbursable} />
        </Row>
      </div>
    </div>
  );
}

export function LoanActionDrawer({ detail, action, onClose, today }: { detail: LoanDetail; action: string | null; onClose: () => void; today: string }) {
  const qc = useQueryClient();
  const l = detail.loan;
  const [remarks, setRemarks] = useState('');
  const [member, setMember] = useState(false);
  const [docs, setDocs] = useState(false);
  const [feasible, setFeasible] = useState(false);
  const [manual, setManual] = useState({ ddoName: '', designation: 'Assistant Secretary', date: '', reference: '' });
  const [amount, setAmount] = useState(0);
  const [instalments, setInstalments] = useState(0);
  const [mode, setMode] = useState<'NEFT' | 'CHEQUE' | 'TRANSFER'>('NEFT');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (!action) return;
    setRemarks('');
    setMember(false);
    setDocs(false);
    setFeasible(false);
    setManual({ ddoName: '', designation: 'Assistant Secretary', date: today, reference: '' });
    setAmount(l.sanctionedAmount ?? l.appliedAmount);
    setInstalments(l.sanctionedInstalments ?? l.appliedInstalments);
    setMode('NEFT');
    setReference('');
    setDate(today);
  }, [action, l, today]);

  const preview = useQuery({
    queryKey: ['sanction-preview', l.id, amount, instalments],
    queryFn: () => api.loans.sanctionPreview(l.id, amount, instalments),
    enabled: action === 'sendForSanction' && amount > 0 && instalments > 0,
    placeholderData: (p) => p,
  });

  const mutation = useMutation({
    mutationFn: (input: LoanActionInput) => api.loans.act(l.id, action!, input),
    onSuccess: (next) => {
      qc.setQueryData(['loan', l.id], next);
      void qc.invalidateQueries({ queryKey: ['loans'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      addSnackbarV2({ header: `${ACTION_LABEL[action!] ?? action} · done`, description: `${next.loan.loanNo ?? next.loan.applicationNo} is now ${next.waitingOn ? `with ${next.waitingOn}` : next.loan.status.toLowerCase().replace(/_/g, ' ')}`, variant: action === 'reject' ? SnackbarV2Variant.WARNING : SnackbarV2Variant.SUCCESS });
      onClose();
    },
  });

  if (!action) return null;
  const meta = TITLES[action] ?? { title: ACTION_LABEL[action] ?? action, description: '' };
  const fe = isApiError(mutation.error) ? (mutation.error.fieldErrors ?? {}) : {};
  const blocks = detail.checks.filter((c) => !c.pass && c.severity === 'block');
  const sheet = action === 'sendForSanction' ? preview.data?.sheet : l.sanctionSheet;

  const input = (): LoanActionInput => {
    const base = remarks.trim() ? { remarks: remarks.trim() } : {};
    switch (action) {
      case 'forward':
        return { ...base, checklist: { memberVerified: member, documentsVerified: docs } };
      case 'ddoCertify':
        return { ...base, recoveryFeasible: feasible };
      case 'ddoRecordManual':
        return { ...base, manual };
      case 'sendForSanction':
        return { ...base, amount, instalments };
      case 'disburse':
        return { ...base, disbursement: { mode, reference: reference.trim(), date } };
      default:
        return base;
    }
  };
  const ready =
    action === 'forward' ? member && docs && !blocks.length
    : action === 'ddoCertify' ? feasible
    : action === 'ddoRecordManual' ? Boolean(manual.ddoName.trim() && manual.designation.trim() && manual.date && manual.reference.trim())
    : action === 'sendForSanction' ? Boolean(preview.data && !Object.keys(preview.data.fieldErrors).length && preview.data.sheet.netDisbursable > 0)
    : action === 'disburse' ? Boolean(reference.trim() && date)
    : NEEDS_REASON.has(action) ? Boolean(remarks.trim())
    : true;

  return (
    <SideDrawer
      open={Boolean(action)}
      onClose={onClose}
      title={meta.title}
      description={meta.description}
      width={600}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} disabled={mutation.isPending} />
          <ButtonV2 text={ACTION_LABEL[action] ?? action} buttonType={action === 'reject' ? ButtonV2Type.DANGER : ButtonV2Type.PRIMARY} disabled={!ready} loading={mutation.isPending} onClick={() => mutation.mutate(input())} />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {mutation.isError && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(mutation.error) ? mutation.error.message : 'Try again.'} />}

        <div className="rounded-card bg-surface-subtle px-4 py-3">
          <p className="text-label text-fg">
            {detail.member.name} · No. {detail.member.generalNo}
          </p>
          <p className="text-caption text-fg-secondary">
            {detail.product.name} · <Money value={l.sanctionedAmount ?? l.appliedAmount} /> · {l.sanctionedInstalments ?? l.appliedInstalments} months · {detail.member.departmentName}
          </p>
        </div>

        {action === 'forward' && (
          <Section title="Checklist">
            <Checkbox checked={member} onCheckedChange={(v) => setMember(v === true)} size={CheckboxSize.MEDIUM}>
              Member details match the member master
            </Checkbox>
            <Checkbox checked={docs} onCheckedChange={(v) => setDocs(v === true)} size={CheckboxSize.MEDIUM}>
              Application and documents verified
            </Checkbox>
            <p className="flex items-center gap-2 text-body text-fg">
              <CircleCheck size={18} className="text-success-fg" aria-hidden /> Sureties confirmed in the app ({detail.sureties.filter((s) => s.status === 'ACCEPTED').length} of {detail.product.suretiesRequired})
            </p>
            <RuleCheckList checks={detail.checks} />
            {blocks.length > 0 && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="A rule fails" description="Return or reject the application instead." />}
          </Section>
        )}

        {action === 'ddoCertify' && (
          <Section title="Items 1–5">
            <div className="divide-y divide-line-subtle rounded-card border border-line px-4 py-1">
              <Row label="1 · Name, General No.">{`${detail.member.name}, ${detail.member.generalNo}`}</Row>
              <Row label="2 · Date of birth">{formatDisplayDate(detail.member.dob)}</Row>
              <Row label="3 · Date of retirement">{formatDisplayDate(detail.member.dor)}</Row>
              <Row label="4 · Office, designation">{`${detail.member.departmentName}, ${detail.member.designation}`}</Row>
              {l.form?.pay && (
                <Row label="5 · Gross / net salary">
                  <Money value={l.form.pay.grossSalary} /> / <Money value={detail.preview.netSalary} />
                </Row>
              )}
            </div>
            <Checkbox checked={feasible} onCheckedChange={(v) => setFeasible(v === true)} size={CheckboxSize.MEDIUM}>
              Particulars are correct and the instalments can be recovered from salary
            </Checkbox>
          </Section>
        )}

        {action === 'ddoRecordManual' && (
          <Section title="Paper certificate">
            <TextField label="DDO name" name="ddoName" value={manual.ddoName} onChange={(v) => setManual((m) => ({ ...m, ddoName: v }))} placeholder={detail.member.departmentName} />
            <TextField label="Designation" name="designation" value={manual.designation} onChange={(v) => setManual((m) => ({ ...m, designation: v }))} />
            <TextInputV2 label="Date of the certificate" type="date" value={manual.date} onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))} />
            <TextField label="Letter reference" name="reference" value={manual.reference} onChange={(v) => setManual((m) => ({ ...m, reference: v }))} placeholder="e.g. FIN/DDO/2026/118" />
            {fe.manual && <p className="text-caption text-danger-fg">{fe.manual}</p>}
          </Section>
        )}

        {action === 'sendForSanction' && (
          <Section title="Sanction">
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField label="Amount to sanction" name="amount" value={amount} onChange={setAmount} errors={preview.data?.fieldErrors ?? fe} hint={`Applied ${amountInWords(l.appliedAmount)}`} />
              <NumberField label="Instalments" name="instalments" value={instalments} onChange={setInstalments} errors={preview.data?.fieldErrors ?? fe} unit="months" hint={preview.data ? `At most ${Math.min(preview.data.maxInstalments, l.appliedInstalments)}` : undefined} />
            </div>
          </Section>
        )}

        {sheet && ['sendForSanction', 'secretarySign', 'presidentSign', 'disburse', 'sendBack'].includes(action) && (
          <Section title="For office use · sanction sheet">
            <SanctionSheetView sheet={sheet} />
          </Section>
        )}

        {(action === 'secretarySign' || action === 'presidentSign' || action === 'sendBack') && (
          <Section title="Sign-offs (D-027)">
            <ol className="flex flex-col gap-3">
              {[
                { n: 1, role: 'Assessed by the Accountant', s: l.signOffs?.assessment },
                { n: 2, role: 'Secretary', s: l.signOffs?.secretary },
                { n: 3, role: 'President', s: l.signOffs?.president },
              ].map((r) => (
                <li key={r.n} className="flex items-start gap-3">
                  <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill text-caption-strong', r.s ? 'bg-success-bg text-success-fg' : 'bg-surface-muted text-fg-tertiary')}>{r.s ? <Check size={14} aria-hidden /> : r.n}</span>
                  <div>
                    <p className="text-label text-fg">{r.role}</p>
                    <p className="text-caption text-fg-secondary">{r.s ? `${r.s.byName} · ${formatDisplayDateTime(r.s.at)}` : 'Pending'}</p>
                    {r.s?.remarks && <p className="text-caption text-fg-tertiary">“{r.s.remarks}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {action === 'disburse' && (
          <Section title="Payment">
            <div role="radiogroup" aria-label="Mode" className="flex flex-wrap gap-2">
              {(['NEFT', 'CHEQUE', 'TRANSFER'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('rounded-pill border px-3 py-1.5 text-label', mode === m ? 'border-brand-solid bg-brand-subtle text-brand-text' : 'border-line text-fg-secondary hover:bg-surface-subtle')}>
                  {m === 'NEFT' ? 'NEFT / RTGS' : m === 'CHEQUE' ? 'Cheque' : 'Account transfer'}
                </button>
              ))}
            </div>
            <TextField label={mode === 'CHEQUE' ? 'Cheque number' : 'UTR / reference'} name="reference" value={reference} onChange={setReference} errors={fe} />
            <TextInputV2 label="Payment date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={fe.date ? { show: true, message: fe.date } : undefined} />
            <p className="text-body text-fg">
              Pay <Money value={l.netDisbursable ?? detail.preview.netDisbursable} className="text-label" /> to {detail.member.name}
              {l.parentLoanId ? ' (after settling the old loan)' : ''}.
            </p>
          </Section>
        )}

        <TextAreaV2
          label={NEEDS_REASON.has(action) ? 'Reason (the member sees this)' : 'Remarks'}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          placeholder={NEEDS_REASON.has(action) ? 'e.g. Attach the salary certificate' : 'Optional'}
          required={NEEDS_REASON.has(action)}
          error={fe.remarks ? { show: true, message: fe.remarks } : undefined}
        />
      </div>
    </SideDrawer>
  );
}
