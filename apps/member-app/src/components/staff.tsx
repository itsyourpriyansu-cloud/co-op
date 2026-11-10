// Small helpers shared by the staff screens (docs/23 §4). Everything visual comes from the existing kit.
import { Children, useEffect, useState, type ReactNode } from 'react';
import { Alert as RNAlert, Linking, Platform, Pressable, Share, StyleSheet, View, ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Printer, Share2, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import { checkPassword, DENOMINATIONS, denominationsFor, formatINR, type Denomination } from '@tgs/domain';
import type { MemberPick, Permission, Role, StaffTicketRow } from '@tgs/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getServerUrl } from '@/lib/serverUrl';
import { Alert, Button, Card, Header, Screen, Segmented, SelectField, Skeleton, Text, TextField, type TagColor, Tag } from '@/ui';
import { color, radius, space, touchTarget } from '@/theme';

export const MUST_CHANGE_KEY = 'tgs.staff.mustChange';
export const TICKET_TAG: Record<StaffTicketRow['status'], { text: string; color: TagColor }> = { OPEN: { text: 'Waiting for reply', color: 'warning' }, ANSWERED: { text: 'Answered', color: 'primary' }, CLOSED: { text: 'Closed', color: 'neutral' } };

// ---- Navigation ----------------------------------------------------------------------------

/** Bottom tabs by role (docs/23 §4.3). Everything else the role may open sits in More. */
export const TABS_BY_ROLE: Partial<Record<Role, string[]>> = {
  ACCOUNTANT: ['home', 'queue', 'members', 'loans', 'more'],
  SECRETARY: ['home', 'queue', 'loans', 'deposits', 'more'],
  PRESIDENT: ['home', 'queue', 'loans', 'deposits', 'more'],
  CASHIER: ['home', 'queue', 'payments', 'deposits', 'more'],
  DDO: ['home', 'queue', 'joining', 'demand', 'more'],
  SUPER_ADMIN: ['home', 'queue', 'members', 'reports', 'more'],
};

const LINKS: Array<[RegExp, string]> = [
  [/^\/members\/change-requests/, '/staff/change-requests'],
  [/^\/members\/([^/?]+)/, '/staff/member/$1'],
  [/^\/loans\/([^/?]+)/, '/staff/loan/$1'],
  [/^\/deposits\/([^/?]+)/, '/staff/deposit/$1'],
  [/^\/payments\/([^/?]+)/, '/staff/payment/$1'],
  [/^\/reports\/([^/?]+)/, '/staff/report/$1'],
  [/^\/demand-sheets/, '/staff/demand'],
  [/^\/notifications/, '/staff/account/notifications'],
  [/^\/settings/, '/staff/settings'],
  [/^\/dashboard/, '/staff/home'],
];

/** The server speaks console paths (work queue, dashboard, notifications, search). */
export function staffHref(link: string): Href {
  for (const [re, to] of LINKS) if (re.test(link)) return link.replace(re, to) as Href;
  return `/staff${link}` as Href;
}

/** Print pages stay on the console (D-106). Local runs use the API's host on the console port. */
export const consoleUrl = (path: string) => `${process.env.EXPO_PUBLIC_CONSOLE_URL ?? getServerUrl().replace(/:\d+$/, ':5180')}${path}`;

export function useCan() {
  const { me } = useAuth();
  return (p: Permission) => !!me?.permissions.includes(p);
}

// ---- Actions -------------------------------------------------------------------------------

/** Ask before anything irreversible. RN's Alert does nothing on web, where the e2e suite runs. */
export function ask(title: string, message: string, ok = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => RNAlert.alert(title, message, [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: ok, onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}

/** busy / error handling for one screen's POSTs. A success refreshes every list and detail. */
export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [unconfirmed, setUnconfirmed] = useState(false);

  const run = async (work: () => Promise<unknown>, after?: () => void): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    setFields({});
    setUnconfirmed(false);
    try {
      await work();
      void qc.invalidateQueries();
      after?.();
      return true;
    } catch (e) {
      if (isApiError(e)) {
        if (e.code === 'NETWORK') setUnconfirmed(true);
        setFields(e.fieldErrors ?? {});
        setError(e.fieldErrors ? (Object.values(e.fieldErrors)[0] ?? e.message) : e.message);
      } else setError('Something went wrong. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, unconfirmed, run };
}

/**
 * The outcome of a failed action. After a lost connection the request may still have been saved, so the
 * person is sent to check instead of being offered a repeat that could post money twice (docs/23 §4.5).
 */
export function ActionAlert({ action, heading = "That didn't work", check }: { action: ReturnType<typeof useAction>; heading?: string; check?: { text: string; href: Href } }) {
  if (action.unconfirmed)
    return <Alert type="warning" heading="We couldn't confirm this was saved" description={`The connection dropped. ${check ? `${check.text} before trying again.` : 'Check the record before trying again.'}`} {...(check ? { action: { text: check.text, onPress: () => router.replace(check.href) } } : {})} />;
  return action.error ? <Alert type="error" heading={heading} description={action.error} /> : null;
}

// ---- Screen parts --------------------------------------------------------------------------

/** Loading, error and no-access states for a query. Children get the data. */
export function Loaded<T>({ q, what, height = 110, count = 3, page, children }: { q: { isLoading: boolean; isError: boolean; data: T | undefined; error: unknown; refetch: () => unknown }; what: string; height?: number; count?: number; page?: boolean; children: (data: T) => ReactNode }) {
  // A record's own page has no Screen until its data is in: give these states the frame and a way back.
  const frame = (state: ReactNode) => (page ? <Screen header={<Header title="" onBack={() => (router.canGoBack() ? router.back() : router.replace('/staff/home'))} />}>{state}</Screen> : state);
  if (q.isLoading)
    return frame(
      <View style={{ gap: space[6] }}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} height={height} radius={radius.card} />
        ))}
      </View>,
    );
  if (q.isError || q.data === undefined) {
    if (isApiError(q.error) && q.error.status === 403) return frame(<Alert type="warning" heading="You don't have access to this" description="Ask the Super Admin if you need it." />);
    if (isApiError(q.error) && q.error.status === 404) return frame(<Alert type="neutral" heading="Not found" description="The record may have been removed." />);
    return frame(<Alert type="error" heading={`Couldn't load ${what}`} description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />);
  }
  return <>{children(q.data)}</>;
}

/** Up to four values fit a Segmented; more go in a picker (docs/23 §4.2). */
export function Filter<T extends string>({ label = 'Show', value, options, onChange, compact }: { label?: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; compact?: boolean }) {
  if (options.length <= 4) return <Segmented label={label} value={value} options={options} onChange={onChange} />;
  const select = <SelectField compact={!!compact} label={label} value={value} options={options} onChange={(v) => onChange(v as T)} />;
  return compact ? <FilterBar>{select}</FilterBar> : select;
}

/** Server text can carry the project's rule and question numbers. They mean nothing to staff. */
export const plain = (text: string) => text.replace(/\s*\((?=[^)]*\b(?:BR|D|Q|F|REQ)-\d)[^)]*\)/g, '');

/** Search, then filters side by side and scrolling sideways, so a list's records stay near the top of the phone. */
export function FilterBar({ search, children }: { search?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      {search}
      {children ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -space[8] }} contentContainerStyle={{ gap: space[3], paddingHorizontal: space[8], paddingVertical: space[1] }}>
          {children}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** One line of the register: who on the left, the figure and its status on the right, what it waits on below. */
export function RecordCard({ title, subtitle, amount, tag, caption, onPress, children }: { title: string; subtitle?: string; amount?: string; tag?: ReactNode; caption?: string; onPress?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <View style={styles.recordHead}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="cardTitle">{title}</Text>
          {subtitle ? (
            <Text role="caption" tone="tertiary">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {amount || tag ? (
          <View style={styles.recordFigure}>
            {amount ? <Text role="amount">{amount}</Text> : null}
            {tag}
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text role="caption" tone="secondary">
          {caption}
        </Text>
      ) : null}
      {children}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.record, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.record}>{body}</View>
  );
}

/** The register: one surface with ruled lines between its records. */
export function Stack2({ children }: { children: ReactNode }) {
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>
          {child}
        </View>
      ))}
    </Card>
  );
}

/** Menu row, as on the member More screen. */
export function Row({ icon: Icon, label, hint, onPress, danger, divider, right }: { icon?: LucideIcon; label: string; hint?: string; onPress: () => void; danger?: boolean; divider?: boolean; right?: ReactNode }) {
  const tint = danger ? color.status.danger.fg : color.text.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menu, divider && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
      {Icon ? <Icon size={22} color={tint} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1, gap: space[1], paddingVertical: space[3] }}>
        <Text role="body" style={{ color: tint }}>
          {label}
        </Text>
        {hint ? (
          <Text role="caption" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
      {!danger ? <ChevronRight size={20} color={color.text.tertiary} /> : null}
    </Pressable>
  );
}

export function StatTile({ label, value, sub, tone, onPress }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'warning' | 'danger' | 'success'; onPress?: () => void }) {
  const fg = tone === 'warning' ? color.status.warning.fg : tone === 'danger' ? color.status.danger.fg : tone === 'success' ? color.status.success.fg : color.text.primary;
  const body = (
    <>
      <Text role="caption" tone="secondary" numberOfLines={2}>
        {label}
      </Text>
      <Text role="sectionTitle" style={{ color: fg, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {sub ? (
        <Text role="caption" tone="tertiary" numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.tile}>{body}</View>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <Card padded={false} style={styles.grid}>
      {Children.toArray(children).map((tile, i) => (
        <View key={i} style={[styles.cell, i % 2 === 1 && styles.ruleLeft, i > 1 && styles.divider]}>
          {tile}
        </View>
      ))}
    </Card>
  );
}

/** A plain horizontal meter (rate 0 to 1). */
export function Meter({ rate, tint = color.brand.solid }: { rate: number; tint?: string }) {
  return (
    <View style={styles.track}>
      <View style={{ height: '100%', borderRadius: 3, backgroundColor: tint, width: `${Math.round(Math.min(1, Math.max(0, rate)) * 100)}%` }} />
    </View>
  );
}

export function WaitTag({ days }: { days: number }) {
  const c: TagColor = days > 7 ? 'error' : days > 3 ? 'warning' : 'neutral';
  return <Tag text={days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`} color={c} size="xs" />;
}

export function PrintButton({ path, text = 'Print' }: { path: string; text?: string }) {
  return <Button text={text} buttonType="secondary" leftSlot={Printer} fullWidth onPress={() => void Linking.openURL(consoleUrl(path))} />;
}

/** CSV goes to the phone's share sheet as text (docs/23 §4.2). */
export function shareCsv(title: string, rows: Array<Array<string | number>>) {
  const message = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return Share.share({ title, message }).catch(() => undefined);
}

export function ShareCsvButton({ title, rows }: { title: string; rows: () => Array<Array<string | number>> | Promise<Array<Array<string | number>>> }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await shareCsv(title, await rows());
    } finally {
      setBusy(false);
    }
  };
  return <Button text="Share CSV" buttonType="secondary" leftSlot={Share2} fullWidth loading={busy} onPress={() => void go()} />;
}

/** A section of a long record that opens in place. Stands in for the console's detail tabs. */
export function Expand({ title, badge, initiallyOpen, flush, children }: { title: string; badge?: ReactNode; initiallyOpen?: boolean; flush?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const body = (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.menu}>
        <Text role="cardTitle" style={{ flex: 1 }}>
          {title}
        </Text>
        {badge}
        {open ? <ChevronDown size={20} color={color.text.tertiary} /> : <ChevronRight size={20} color={color.text.tertiary} />}
      </Pressable>
      {open ? <View style={styles.expandBody}>{children}</View> : null}
    </>
  );
  return flush ? <View>{body}</View> : <Card padded={false}>{body}</Card>;
}

/** Every rule outcome, explained (the console's RuleCheckList). */
export function RuleChecks({ checks }: { checks: Array<{ ruleId: string; pass: boolean; message: string; severity?: string }> }) {
  return (
    <View style={{ gap: space[4] }}>
      {checks.map((c, i) => {
        const Icon = c.pass ? CircleCheck : c.severity === 'warn' ? TriangleAlert : CircleX;
        const tint = c.pass ? color.status.success.fg : c.severity === 'warn' ? color.status.warning.fg : color.status.danger.fg;
        return (
          <View key={`${c.ruleId}-${i}`} style={{ flexDirection: 'row', gap: space[3] }}>
            <Icon size={18} color={tint} />
            <Text role="body" style={{ flex: 1 }}>
              {c.message}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Rupees typed, paise stored. NaN while empty, as the console's MoneyField does. */
export function MoneyField({ label, value, onChange, error, hint, required, disabled }: { label: string; value: number; onChange: (paise: number) => void; error?: string | undefined; hint?: string | undefined; required?: boolean; disabled?: boolean }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value / 100) : '');
  useEffect(() => {
    setText((t) => (Math.round(Number(t) * 100) === value ? t : Number.isFinite(value) ? String(value / 100) : ''));
  }, [value]);
  return (
    <TextField
      label={label}
      prefix="₹"
      value={text}
      keyboardType="decimal-pad"
      editable={!disabled}
      {...(required ? { required } : {})}
      {...(error ? { error } : {})}
      {...(hint ? { hint } : {})}
      onChangeText={(raw) => {
        const t = raw.replace(/[^0-9.]/g, '');
        setText(t);
        onChange(t === '' ? Number.NaN : Math.round(Number(t) * 100));
      }}
    />
  );
}

/** The server's business date (the demo clock when one is set), never the phone's. */
export function useToday(): string {
  const q = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });
  // D-065: the demo clock wins, as on the console. The route doesn't exist outside demo mode.
  const demo = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state, staleTime: 60_000, retry: false });
  return demo.data?.today ?? q.data?.today ?? new Date().toISOString().slice(0, 10);
}

/** A date that starts as the server's today. Once edited it stays as typed, even when cleared. */
export function useTodayDate() {
  const today = useToday();
  const [picked, setPicked] = useState<string | undefined | null>(null);
  return { today, date: picked === null ? today : picked, setDate: (d?: string) => setPicked(d) };
}

export type Counts = Partial<Record<Denomination, number>>;
export const countsTotal = (c: Counts) => DENOMINATIONS.reduce((s, d) => s + d * 100 * (c[d] ?? 0), 0);

/** BR-029 cash slip in one line, docked above the confirm button. */
export function CashStatus({ amount, counts }: { amount: number; counts: Counts }) {
  const total = countsTotal(counts);
  const ok = total === amount;
  return (
    <Text role="captionStrong" tone={ok ? 'success' : 'danger'} accessibilityLiveRegion="polite">
      Counted {formatINR(total)} · {ok ? 'matches the amount' : `${total < amount ? 'short' : 'over'} by ${formatINR(Math.abs(amount - total))}`}
    </Text>
  );
}

/** BR-029: notes × count, the total must equal the amount. */
export function DenominationCounter({ amount, counts, onChange }: { amount: number; counts: Counts; onChange: (c: Counts) => void }) {
  return (
    <View style={{ gap: space[3] }}>
      {DENOMINATIONS.map((d) => (
        <View key={d} style={styles.row}>
          <Text role="label" style={{ width: 64 }}>
            ₹{d} ×
          </Text>
          <View style={{ flex: 1 }}>
            <TextField compact label={`Number of ₹${d} notes`} keyboardType="number-pad" value={counts[d] ? String(counts[d]) : ''} onChangeText={(t) => onChange({ ...counts, [d]: Math.floor(Number(t.replace(/\D/g, '')) || 0) })} />
          </View>
          <Text role="body" tone="secondary" style={{ minWidth: 96, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {formatINR(d * 100 * (counts[d] ?? 0))}
          </Text>
        </View>
      ))}
      <Button text="Fill fewest notes" subType="inline" style={{ alignSelf: 'flex-start' }} onPress={() => onChange(denominationsFor(amount))} />
    </View>
  );
}

/** Result of a finished decision, with one way forward. */
export function DoneAlert({ heading, description }: { heading: string; description?: string }) {
  return <Alert type="success" heading={heading} {...(description ? { description } : {})} />;
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export { useDebounced };

/** Find a member by name or General No. (the console's MemberSearch). */
export function MemberPicker({ label = 'Member', value, onPick, error, exclude = [] }: { label?: string; value?: MemberPick | undefined; onPick: (m: MemberPick | undefined) => void; error?: string | undefined; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const found = useQuery({ queryKey: ['member-search', dq], queryFn: () => api.loans.searchMembers(dq), enabled: dq.length >= 2 });
  const res = { isLoading: found.isLoading, data: found.data?.filter((m) => !exclude.includes(m.id)) };
  if (value)
    return (
      <Card>
        <View style={styles.row}>
          <UserRound size={20} color={color.brand.solid} />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="label">{value.name}</Text>
            <Text role="caption" tone="tertiary">
              General No. {value.generalNo} · {value.departmentName}
            </Text>
          </View>
          <Button text="Change" subType="inline" onPress={() => onPick(undefined)} />
        </View>
      </Card>
    );
  return (
    <View style={{ gap: space[4] }}>
      <TextField label={label} value={q} onChangeText={setQ} placeholder="Name or General No." autoCorrect={false} error={error} />
      {dq.length >= 2 && res.isLoading ? <Skeleton height={68} radius={radius.card} /> : null}
      {dq.length >= 2 && res.data?.length === 0 ? (
        <Text role="caption" tone="tertiary">
          No member matches “{dq}”.
        </Text>
      ) : null}
      {res.data?.length ? (
        <Card padded={false}>
          {res.data.slice(0, 8).map((m, i) => (
            <Row key={m.id} label={m.name} hint={`General No. ${m.generalNo} · ${m.departmentName}`} divider={i > 0} onPress={() => onPick(m)} />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** New password with the society's rules, used at forced change and from My account. */
export function PasswordForm({ currentLabel, currentValue, onCurrent, employeeId, busy, fields, onSave, submitText }: { currentLabel: string; currentValue: string; onCurrent: (v: string) => void; employeeId?: string; busy: boolean; fields: Record<string, string>; onSave: (next: string) => void; submitText: string }) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const check = checkPassword(next, { employeeId });
  return (
    <View style={{ gap: space[8] }}>
      <TextField label={currentLabel} value={currentValue} onChangeText={onCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" error={fields.currentPassword} />
      <TextField label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={fields.newPassword} />
      <View style={{ gap: space[2] }} accessibilityLabel="Password rules">
        {check.checks.map((c) => (
          <Text key={c.ruleId} role="caption" tone={next && c.pass ? 'success' : 'secondary'}>
            {next && c.pass ? '✓ ' : '• '}
            {c.message}
          </Text>
        ))}
      </View>
      <TextField label="Type the new password again" value={again} onChangeText={(v) => (setAgain(v), setMismatch(false))} secureTextEntry autoCapitalize="none" autoComplete="new-password" {...(mismatch ? { error: 'The two passwords do not match.' } : {})} />
      <Button text={submitText} size="lg" fullWidth loading={busy} disabled={!currentValue || !check.ok || !again || busy} onPress={() => (next === again ? onSave(next) : setMismatch(true))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  menu: { flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: touchTarget + 8, paddingHorizontal: space[8] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  cell: { flexGrow: 1, flexBasis: '50%' },
  ruleLeft: { borderLeftWidth: 1, borderLeftColor: color.border.subtle },
  tile: { flex: 1, gap: space[1], padding: space[6] },
  record: { gap: space[3], padding: space[8] },
  recordHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4] },
  recordFigure: { alignItems: 'flex-end', gap: space[2], maxWidth: '50%' },
  expandBody: { paddingHorizontal: space[8], paddingBottom: space[8], gap: space[4] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: color.bg.surfaceSunken },
});
