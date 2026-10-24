// Scenario catalog (docs/20): every demoable data state, mapped to persona, record and screens.
// Console scenarios: one click signs in as the right persona and opens the module.
import { useState } from 'react';
import { LogIn, Smartphone } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ButtonV2, ButtonV2Size, ButtonV2Type, ColumnType, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, type ColumnDefinition } from '@juspay/blend-design-system';
import { channelForRole, ROLE_LABELS, type Scenario, type ScenarioArea } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { api } from '@/lib/api';
import { Table } from '@/components/Table';

const AREA_ROUTE: Record<ScenarioArea, string> = {
  membership: '/joining',
  members: '/members',
  loans: '/loans',
  sureties: '/loans',
  deposits: '/deposits',
  collections: '/demand-sheets',
  payments: '/payments',
  profile: '/members',
  system: '/dashboard',
};

type Row = { id: string; area: ScenarioArea; title: string; description: string; personaId: string; role: Scenario['role']; screens: string; state: string; milestone: string };

export function ScenariosTab() {
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: api.demo.scenarios });
  const personas = useQuery({ queryKey: ['personas', 'all'], queryFn: () => api.demo.personas() });
  const { loginAsPersona } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [area, setArea] = useState<ScenarioArea | 'all'>('all');
  const personaName = (id: string) => personas.data?.find((p) => p.id === id)?.name ?? id;

  const all: Row[] = (scenarios.data ?? []).map((s) => ({ id: s.id, area: s.area, title: s.title, description: s.description, personaId: s.personaId, role: s.role, screens: s.screens.join(', '), state: s.state, milestone: s.milestone }));
  const rows = area === 'all' ? all : all.filter((r) => r.area === area);
  const areas = [...new Set(all.map((r) => r.area))];

  const open = async (row: Row) => {
    await loginAsPersona(row.personaId);
    await queryClient.invalidateQueries();
    navigate(AREA_ROUTE[row.area]);
  };

  const columns: ColumnDefinition<Row>[] = [
    { field: 'id', header: 'Scenario', type: ColumnType.TEXT, width: '220px' },
    {
      field: 'title',
      header: 'What it shows',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="flex min-w-0 flex-col py-1">
          <span className="text-label text-fg">{r.title}</span>
          <span className="text-caption text-fg-tertiary">{r.description}</span>
        </div>
      ),
    },
    { field: 'state', header: 'State', type: ColumnType.TEXT, width: '170px' },
    { field: 'screens', header: 'Screens', type: ColumnType.TEXT, width: '160px' },
    { field: 'milestone', header: 'Built in', type: ColumnType.TEXT, width: '90px' },
    {
      field: 'personaId',
      header: 'Open as',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      width: '230px',
      renderCell: (_v, r) =>
        channelForRole(r.role) === 'console' ? (
          <ButtonV2 text={`${personaName(r.personaId)} · ${ROLE_LABELS[r.role]}`} size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <LogIn size={14} /> }} onClick={() => void open(r)} />
        ) : (
          <TagV2 text={`Member App · ${personaName(r.personaId)}`} size={TagV2Size.SM} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} color={TagV2Color.PURPLE} leftSlot={{ slot: <Smartphone size={12} /> }} />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-fg-secondary">
        {all.length} scenarios generated from the dataset, each pointing at a real record. Console scenarios sign you in as the right persona and open the module (screens fill in as each milestone is built). Member App scenarios: sign in on the phone as the named member.
      </p>
      <div className="flex flex-wrap gap-2">
        {(['all', ...areas] as const).map((a) => (
          <ButtonV2 key={a} text={a === 'all' ? `All (${all.length})` : `${a} (${all.filter((r) => r.area === a).length})`} size={ButtonV2Size.SMALL} buttonType={a === area ? ButtonV2Type.PRIMARY : ButtonV2Type.SECONDARY} onClick={() => setArea(a)} />
        ))}
      </div>
      <Table<Row> data={rows} columns={columns} idField="id" isLoading={scenarios.isLoading} error={scenarios.isError} onRetry={() => void scenarios.refetch()} isHoverable enableSearch searchPlaceholder="Search scenarios" />
    </div>
  );
}
