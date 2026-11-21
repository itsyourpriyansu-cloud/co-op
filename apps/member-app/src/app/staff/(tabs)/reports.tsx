// ST-50m Reports catalogue (J-13, D-063) and the printable forms and letters (ST-52m).
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, Lock, ScrollText } from 'lucide-react-native';
import type { ReportDef } from '@tgs/types';
import { Loaded, Row, plain } from '@/components/staff';
import { api } from '@/lib/api';
import { Card, Screen, Section, Token, Text } from '@/ui';
import { color, spacing } from '@/theme';

const GROUPS: Array<ReportDef['group']> = ['Collections', 'Loans', 'Deposits & Shares', 'Members', 'Cash & Accounts'];

/** The printables. Each one is printed from its record, inside the app (D-133): this opens the list to pick it from. */
const PRINTABLES: Array<{ key: string; title: string; form?: string; hint: string; href: Href }> = [
  { key: 'receipt', title: 'Receipt', hint: 'Open a receipt in Payments', href: '/staff/payments' },
  { key: 'sanction', title: 'Sanction letter, bond, schedule', form: 'F7–F9', hint: 'Open a sanctioned loan', href: '/staff/loans' },
  { key: 'demand', title: 'Demand sheet', hint: 'Open a sheet', href: '/staff/demand' },
  { key: 'fd', title: 'Fixed deposit form, FDR, vouchers', form: 'F4 / F10', hint: 'Open a fixed deposit', href: '/staff/deposits' },
  { key: 'defaulter', title: 'Defaulter notice', hint: 'Open a defaulter from the Defaulters report', href: '/staff/report/defaulters' },
  { key: 'membership', title: 'Membership application', form: 'F1', hint: 'Open an application, or a member', href: '/staff/joining' },
  { key: 'loan', title: 'Loan application', form: 'F2 / F3', hint: 'Open a loan', href: '/staff/loans' },
  { key: 'agreement', title: 'Recovery agreement', form: 'F5 / F6', hint: 'Open a member', href: '/staff/members' },
];

export default function Reports() {
  const q = useQuery({ queryKey: ['reports'], queryFn: api.reports.catalogue });
  // The defaulter notice is printed from the member: start from the defaulters list.
  const open = (r: ReportDef) => router.push(`/staff/report/${r.kind === 'print' ? 'defaulters' : r.id}`);
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: spacing[0.5] }}>
        <Text type="h1">Reports</Text>
        <Text type="supporting" tone="secondary">
          From the live ledgers, with CSV to share
        </Text>
      </View>
      <Loaded q={q} what="reports">
        {(d) => (
          <>
            {GROUPS.map((g) => {
              const items = d.reports.filter((r) => r.group === g);
              return items.length ? (
                <Section key={g} title={g}>
                  <Card padded={false}>
                    {items.map((r, i) =>
                      r.available ? (
                        <Row key={r.id} label={r.title} hint={plain(r.description)} divider={i > 0} onPress={() => open(r)} />
                      ) : (
                        <View key={r.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing[1.5], paddingHorizontal: spacing[4], paddingVertical: spacing[3] }, i > 0 && { borderTopWidth: 1, borderTopColor: color.border }]} accessible accessibilityLabel={`${r.title}, not available yet`}>
                          <View style={{ flex: 1, gap: spacing[0.5] }}>
                            <Text type="body" tone="secondary">
                              {r.title}
                            </Text>
                            <Text type="supporting" tone="secondary">
                              Not available yet
                            </Text>
                          </View>
                          <Lock size={16} color={color.text.secondary} />
                        </View>
                      ),
                    )}
                  </Card>
                </Section>
              ) : null;
            })}
            <Section title="Printable forms & letters" description="On the society letterhead, with signatures. Open the record, then Download PDF or Print.">
              <Card padded={false}>
                {PRINTABLES.map((p, i) => (
                  <Row key={p.key} icon={p.form ? ScrollText : FileText} label={p.title} hint={p.hint} divider={i > 0} {...(p.form ? { right: <Token text={p.form} status="neutral" size="xs" /> } : {})} onPress={() => router.push(p.href)} />
                ))}
              </Card>
            </Section>
          </>
        )}
      </Loaded>
    </Screen>
  );
}
