// Foundations: every value shown here is read from @tgs/design-tokens. Nothing is typed by hand.
import { CardV2, CardV2Variant } from '@juspay/blend-design-system';
import { elevation, light, motion, palette, radius, space, textRoles, type TextRoleName } from '@tgs/design-tokens';
import { SectionTitle } from '@/components/PageHeader';
import { TEXT_ROLE_CLASS } from '@/lib/typography';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

function Swatch({ color, label, sub }: { color: string; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="h-12 rounded-control border border-line-subtle" style={{ background: color }} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-caption-strong text-fg">{label}</div>
        {sub && <div className="truncate text-caption text-fg-tertiary tabular">{sub}</div>}
      </div>
    </div>
  );
}

export function FoundationsTab() {
  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionTitle>Semantic colours (what screens use)</SectionTitle>
        <p className="mb-4 max-w-3xl text-body text-fg-secondary">
          Screens use roles, never raw palette steps. These swatches read the live CSS variables, so toggle dark mode in the top bar to see the dark values.
        </p>
        <div className="flex flex-col gap-6">
          {(['bg', 'text', 'border', 'brand'] as const).map((group) => (
            <div key={group}>
              <h3 className="mb-2 text-overline text-fg-tertiary">{group}</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
                {Object.keys(light[group]).map((k) => {
                  const cssVar = `--tgs-${group === 'bg' ? 'bg' : group === 'text' ? 'text' : group === 'border' ? 'border' : 'brand'}-${kebab(k)}`;
                  return <Swatch key={k} color={`var(${cssVar})`} label={k} sub={cssVar} />;
                })}
              </div>
            </div>
          ))}
          <div>
            <h3 className="mb-2 text-overline text-fg-tertiary">status (fg · bg · border · solid)</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Object.keys(light.status).map((name) => (
                <CardV2 key={name} variant={CardV2Variant.OUTLINED}>
                  <div className="mb-3 text-label capitalize text-fg">{name}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(['fg', 'bg', 'border', 'solid'] as const).map((k) => (
                      <Swatch key={k} color={`var(--tgs-status-${name}-${k})`} label={k} />
                    ))}
                  </div>
                </CardV2>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Blend foundation palette</SectionTitle>
        <p className="mb-4 max-w-3xl text-body text-fg-secondary">Mirrored value-for-value from Blend's FOUNDATION_THEME and verified by a parity test. Brand = the primary scale (swap point in brand.ts, Q-008).</p>
        <div className="flex flex-col gap-4">
          {Object.entries(palette).map(([name, scale]) => (
            <div key={name} className="grid grid-cols-[88px_1fr] items-start gap-4">
              <div className="pt-3 text-label capitalize text-fg">{name}</div>
              <div className="grid grid-cols-6 gap-2 md:grid-cols-11 xl:grid-cols-15">
                {Object.entries(scale).map(([step, hex]) => (
                  <Swatch key={step} color={hex} label={step} sub={hex} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Typography roles</SectionTitle>
        <CardV2 variant={CardV2Variant.OUTLINED}>
          <ul className="flex flex-col divide-y divide-line-subtle">
            {Object.entries(textRoles).map(([name, r]) => (
              <li key={name} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[180px_1fr_160px] md:items-center">
                <code className="text-caption text-fg-tertiary">text-{kebab(name)}</code>
                <span className={`${TEXT_ROLE_CLASS[name as TextRoleName]} text-fg`}>{r.tabular ? '₹12,45,000.00 · 1,604' : 'Loan sanctioned for Lakshmi Devi'}</span>
                <span className="tabular text-caption text-fg-tertiary">
                  {r.fontSize}/{r.lineHeight} · {r.fontWeight}
                </span>
              </li>
            ))}
          </ul>
        </CardV2>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div>
          <SectionTitle>Space (4-pt)</SectionTitle>
          <CardV2 variant={CardV2Variant.OUTLINED}>
            <ul className="flex flex-col gap-2">
              {Object.entries(space).map(([k, v]) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="tabular w-10 text-caption text-fg-tertiary">{v}px</span>
                  <span className="h-3 rounded-xs bg-brand" style={{ width: v * 3 }} />
                </li>
              ))}
            </ul>
          </CardV2>
        </div>
        <div>
          <SectionTitle>Radius</SectionTitle>
          <CardV2 variant={CardV2Variant.OUTLINED}>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(radius).map(([k, v]) => (
                <div key={k} className="flex flex-col items-center gap-1.5">
                  <div className="size-14 border border-brand-border bg-brand-subtle" style={{ borderRadius: v === 9999 ? 9999 : v }} />
                  <span className="text-caption text-fg-secondary">
                    {k} · {v === 9999 ? 'full' : `${v}px`}
                  </span>
                </div>
              ))}
            </div>
          </CardV2>
        </div>
        <div>
          <SectionTitle>Elevation & motion</SectionTitle>
          <CardV2 variant={CardV2Variant.OUTLINED}>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(elevation).map(([k, v]) => (
                <div key={k} className="flex h-16 items-center justify-center rounded-card bg-surface text-caption text-fg-secondary" style={{ boxShadow: v }}>
                  {k}
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-col gap-1 text-caption text-fg-secondary">
              {Object.entries(motion.duration).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular">{v} ms</span>
                </li>
              ))}
            </ul>
          </CardV2>
        </div>
      </section>
    </div>
  );
}
