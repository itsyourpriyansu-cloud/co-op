// ST-50m Reports catalogue (J-13, D-063) and the printable forms and letters (ST-52m).
import { Linking, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, Lock, ScrollText } from 'lucide-react-native';
import type { ReportDef } from '@tgs/types';
import { consoleUrl, Loaded, Row, plain } from '@/components/staff';
import { api } from '@/lib/api';
import { Card, Screen, Section, Tag, Text } from '@/ui';
import { color, space } from '@/theme';

const GROUPS: Array<ReportDef['group']> = ['Collections', 'Loans', 'Deposits & Shares', 'Members', 'Cash & Accounts'];

/** The nine printables. `href` opens the list the record is printed from; the rest open the console's print page (D-106). */
const PRINTABLES: Array<{ key: string; title: string; form?: string; hint: string; href?: Href; print?: string }> = [
  { key: 'receipt', title: 'Receipt', hint: 'Open a receipt in Payments, then Print', href: '/staff/payments' },
  { key: 'sanction', title: 'Sanction letter', hint: 'Open a sanctioned loan, then Sanction letter', href: '/staff/loans' },
  { key: 'demand', title: 'Demand sheet', hint: 'Open a sheet, then Print', href: '/staff/demand' },
  { key: 'fd', title: 'Fixed deposit form + FDR', form: 'F4', hint: 'The green F4 form with the cash slip', print: '/reports/print/fd-form' },
  { key: 'defaulter', title: 'Defaulter notice', hint: 'Asks a member to clear overdue dues', print: '/reports/print/defaulter-notice' },
  { key: 'membership', title: 'Membership application', form: 'F1', hint: 'The white form', print: '/reports/print/membership' },
  { key: 'loan', title: 'Ordinary / Education loan application', form: 'F2', hint: 'The green form with sureties and the DDO certificate', print: '/reports/print/loan-form' },
  { key: 'salary', title: 'Salary loan application', form: 'F3', hint: 'The white slip with the office-use block', print: '/reports/print/loan-form?product=SALARY' },
  { key: 'agreement', title: 'Recovery agreement', form: 'F5 / F6', hint: 'Salary recovery authorisation', print: '/reports/print/agreement' },
];

export default function Reports() {
  const q = useQuery({ queryKey: ['reports'], queryFn: api.reports.catalogue });
  const open = (r: ReportDef) => (r.kind === 'print' ? void Linking.openURL(consoleUrl(r.printLink!)) : router.push(`/staff/report/${r.id}`));
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: space[1] }}>
        <Text role="pageTitle">Reports</Text>
        <Text role="caption" tone="secondary">
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
                        <View key={r.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[8], paddingVertical: space[6] }, i > 0 && { borderTopWidth: 1, borderTopColor: color.border.subtle }]} accessible accessibilityLabel={`${r.title}, not available yet`}>
                          <View style={{ flex: 1, gap: space[1] }}>
                            <Text role="body" tone="tertiary">
                              {r.title}
                            </Text>
                            <Text role="caption" tone="tertiary">
                              Not available yet
                            </Text>
                          </View>
                          <Lock size={16} color={color.text.tertiary} />
                        </View>
                      ),
                    )}
                  </Card>
                </Section>
              ) : null;
            })}
            <Section title="Printable forms & letters" description="All nine print on the society letterhead. Forms open in your browser.">
              <Card padded={false}>
                {PRINTABLES.map((p, i) => (
                  <Row key={p.key} icon={p.form ? ScrollText : FileText} label={p.title} hint={p.hint} divider={i > 0} {...(p.form ? { right: <Tag text={p.form} color="neutral" size="xs" /> } : {})} onPress={() => (p.href ? router.push(p.href) : void Linking.openURL(consoleUrl(p.print!)))} />
                ))}
              </Card>
            </Section>
          </>
        )}
      </Loaded>
    </Screen>
  );
}
