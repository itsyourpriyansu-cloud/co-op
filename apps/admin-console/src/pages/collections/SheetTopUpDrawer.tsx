// D-124: Regenerate a sheet that is not certified yet, or add a supplementary sheet for members the
// month's sheet missed. The drawer shows who would be added first; the server repeats every check.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type, SnackbarV2Variant, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { Money } from '@/components/Money';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { cycleLabel } from './collections';

interface Props {
  mode: 'regenerate' | 'supplement';
  sheetId: string;
  cycle: string;
  departmentId: string;
  departmentName: string;
  open: boolean;
  onClose: () => void;
  /** Regenerate: the same sheet, refreshed. Supplement: the new sheet's id. */
  onDone: (sheetId: string) => void;
}

export function SheetTopUpDrawer({ mode, sheetId, cycle, departmentId, departmentName, open, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['demand-topup-preview', mode, sheetId, cycle, departmentId],
    queryFn: () => (mode === 'regenerate' ? api.demand.regeneratePreview(sheetId) : api.demand.supplementaryPreview(cycle, departmentId)),
    enabled: open,
  });
  const run = useMutation({
    mutationFn: () => (mode === 'regenerate' ? api.demand.regenerate(sheetId) : api.demand.createSupplementary(cycle, departmentId)),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: ['demand-overview'] });
      void qc.invalidateQueries({ queryKey: ['demand-sheet'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      addSnackbarV2({ header: mode === 'regenerate' ? 'Sheet regenerated' : 'Supplementary sheet made', description: `${departmentName} · ${cycleLabel(cycle)}`, variant: SnackbarV2Variant.SUCCESS });
      onDone(id);
    },
  });
  const p = preview.data;
  const nothing = p && !p.added.length && !p.removed.length;
  const title = mode === 'regenerate' ? 'Regenerate this sheet' : 'Add a supplementary sheet';
  const description =
    mode === 'regenerate'
      ? 'Rebuilds the member lines from today\'s records, so members the sheet missed are added. Allowed only before the sheet is certified, and while no payment is recorded on it.'
      : 'A new numbered sheet for members no sheet of this month has. The month\'s own sheet is not changed. It goes through Certify, Send to DDO, deductions and Post like any other.';
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} disabled={run.isPending} />
          <ButtonV2 text={mode === 'regenerate' ? 'Regenerate' : 'Make supplementary sheet'} loading={run.isPending} disabled={!p || Boolean(p.blocked) || Boolean(nothing)} onClick={() => run.mutate()} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {preview.isLoading && <p className="text-body text-fg-tertiary">Checking who is missing…</p>}
        {preview.isError && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't check" description={isApiError(preview.error) ? preview.error.message : 'Try again.'} />}
        {p?.blocked && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Not possible now" description={p.blocked} />}
        {p && !p.blocked && (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-card border border-line bg-surface-subtle px-4 py-3">
              <div>
                <p className="text-caption text-fg-tertiary">{mode === 'regenerate' ? 'Demand now' : 'Added demand'}</p>
                <p className="text-label text-fg">
                  <Money value={mode === 'regenerate' ? p.oldTotal : p.newTotal} />
                </p>
              </div>
              {mode === 'regenerate' && (
                <div>
                  <p className="text-caption text-fg-tertiary">Demand after</p>
                  <p className="text-label text-fg">
                    <Money value={p.newTotal} />
                  </p>
                </div>
              )}
            </div>
            {nothing && <p className="text-body text-fg-secondary">Nobody is missing. The sheet already has everyone.</p>}
            {p.added.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Will be added ({p.added.length})</h3>
                <ul className="divide-y divide-line-subtle rounded-card border border-line">
                  {p.added.map((a) => (
                    <li key={a.memberId} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="text-body text-fg">
                        {a.name} <span className="text-caption text-fg-tertiary">No. {a.generalNo}</span>
                      </span>
                      <span className="tabular text-body">
                        <Money value={a.demand} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {p.removed.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Will be removed ({p.removed.length})</h3>
                <ul className="divide-y divide-line-subtle rounded-card border border-line">
                  {p.removed.map((a) => (
                    <li key={a.memberId} className="px-4 py-2 text-body text-fg">
                      {a.name} <span className="text-caption text-fg-tertiary">No. {a.generalNo}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-fg-tertiary">Members who left the department or the society, or whose loan was closed.</p>
              </section>
            )}
          </>
        )}
        {run.error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't save" description={isApiError(run.error) ? run.error.message : 'Try again.'} />}
      </div>
    </SideDrawer>
  );
}
