// Status language: every workflow status, its tone, and the words staff vs members see.
import { CardV2, CardV2Variant, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { presentStatus, STATUS_PRESENTATION_KEYS, toneToBlendColor, type StatusEntity } from '@tgs/design-tokens';
import type { AnyStatus } from '@tgs/types';
import { SectionTitle } from '@/components/PageHeader';

const ENTITY_LABEL: Record<string, string> = {
  loan: 'Loans',
  membership: 'Membership applications',
  deposit: 'Fixed deposits',
  demandSheet: 'Demand sheets',
  surety: 'Sureties',
  schedule: 'Repayment schedule',
  paymentReport: 'Member-reported payments',
  changeRequest: 'Profile change requests',
  member: 'Members',
  ticket: 'Support tickets',
};

export function StatusTab() {
  const byEntity = STATUS_PRESENTATION_KEYS.reduce<Record<string, string[]>>((acc, key) => {
    const [entity, status] = key.split(':') as [string, string];
    (acc[entity] ??= []).push(status);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-body text-fg-secondary">
        One map (packages/design-tokens/src/status.ts) decides the tone and words for every status, in the console and the app. Staff see process language; members see plain language. Approval stages use the purple tone so "waiting for a signature" is never confused with
        "in progress".
      </p>
      {Object.entries(byEntity).map(([entity, statuses]) => (
        <section key={entity}>
          <SectionTitle>{ENTITY_LABEL[entity] ?? entity}</SectionTitle>
          <CardV2 variant={CardV2Variant.OUTLINED}>
            <div className="grid grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)] gap-x-6 gap-y-3 text-caption">
              <span className="text-overline text-fg-tertiary">Status</span>
              <span className="text-overline text-fg-tertiary">Staff (console)</span>
              <span className="text-overline text-fg-tertiary">Member (app)</span>
              {statuses.map((status) => {
                const staff = presentStatus(entity as StatusEntity, status as AnyStatus, 'staff');
                const member = presentStatus(entity as StatusEntity, status as AnyStatus, 'member');
                const color = toneToBlendColor[staff.tone] as TagV2Color;
                return [
                  <code key={`${status}-k`} className="self-center text-fg-secondary">{status}</code>,
                  <span key={`${status}-s`}>
                    <TagV2 text={staff.label} color={color} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} />
                  </span>,
                  <span key={`${status}-m`}>
                    <TagV2 text={member.label} color={color} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} />
                  </span>,
                ];
              })}
            </div>
          </CardV2>
        </section>
      ))}
    </div>
  );
}
