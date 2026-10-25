// ST-67 Departments & DDOs: who certifies and deducts for each office (incl. external offices
// for members transferred out of the Secretariat, Q-512).
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2Type, ColumnType, Radio, RadioGroup, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, type ColumnDefinition } from '@juspay/blend-design-system';
import type { Department, DepartmentRow } from '@tgs/types';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

type Row = DepartmentRow & Record<string, unknown>;
const EMPTY: Partial<Department> = { code: '', name: '', kind: 'SECRETARY_DEPT', ddoName: '', ddoDesignation: 'Assistant Secretary to Government' };

export function DepartmentsSection({ canEdit }: { canEdit: boolean }) {
  const list = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const [editing, setEditing] = useState<Partial<Department> | null>(null);
  const save = useSettingsSave((d: Partial<Department>) => (d.id ? api.settings.updateDepartment(d.id, d) : api.settings.createDepartment(d)), 'Department saved');
  const errors = fieldErrorsOf(save.error);
  const set = (patch: Partial<Department>) => setEditing((e) => ({ ...e, ...patch }));

  const columns: ColumnDefinition<Row>[] = [
    { field: 'code', header: 'Code', type: ColumnType.TEXT, width: '90px' },
    {
      field: 'name',
      header: 'Department / office',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      minWidth: '220px',
      renderCell: (_v, r) => (
        <div className="flex items-center gap-2">
          <span className="text-label text-fg">{r.name}</span>
          {r.kind === 'EXTERNAL_OFFICE' && <TagV2 text="Outside Secretariat" size={TagV2Size.XS} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
        </div>
      ),
    },
    {
      field: 'ddoName',
      header: 'DDO',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      minWidth: '220px',
      renderCell: (_v, r) => (
        <div>
          <p className="text-body text-fg">{r.ddoName}</p>
          <p className="text-caption text-fg-tertiary">{r.ddoDesignation}</p>
        </div>
      ),
    },
    { field: 'ddoUserId', header: 'Console login', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => (r.ddoUserId ? <TagV2 text="Has login" size={TagV2Size.XS} color={TagV2Color.SUCCESS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} /> : <span className="text-caption text-fg-tertiary">No login yet</span>) },
    { field: 'memberCount', header: 'Members', type: ColumnType.NUMBER, width: '110px' },
    ...(canEdit
      ? [{ field: 'id' as const, header: '', type: ColumnType.REACT_ELEMENT, isSortable: false, width: '90px', renderCell: (_v: unknown, r: Row) => <ButtonV2 text="Edit" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={14} /> }} onClick={() => setEditing(r)} /> } satisfies ColumnDefinition<Row>]
      : []),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">{list.data ? `${list.data.length} offices · DDOs certify membership and loan applications and deduct dues from salary.` : ' '}</p>
        {canEdit && <ButtonV2 text="Add department" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => setEditing({ ...EMPTY })} />}
      </div>
      <ViewState state={list.isLoading ? 'loading' : list.isError ? 'error' : 'ready'} layout="table" onRetry={() => void list.refetch()}>
        <Table<Row> data={(list.data ?? []) as Row[]} columns={columns} idField="id" isHoverable showToolbar={false} />
      </ViewState>
      <SideDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add department'}
        description="The DDO certifies applications for members of this office and deducts their dues."
        footer={
          <div className="flex justify-end gap-2">
            <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={() => setEditing(null)} />
            <ButtonV2 text="Save" loading={save.isPending} onClick={() => editing && save.mutate(editing, { onSuccess: () => setEditing(null) })} />
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <TextField label="Code" name="code" value={editing.code ?? ''} onChange={(code) => set({ code: code.toUpperCase() })} errors={errors} placeholder="e.g. TOUR" />
              <TextField label="Name" name="name" value={editing.name ?? ''} onChange={(name) => set({ name })} errors={errors} placeholder="e.g. Tourism" />
            </div>
            <RadioGroup name="kind" label="Type" value={editing.kind ?? 'SECRETARY_DEPT'} onChange={(kind) => set({ kind: kind as Department['kind'] })}>
              <Radio value="SECRETARY_DEPT">Secretariat department</Radio>
              <Radio value="EXTERNAL_OFFICE" subtext="For members transferred outside the Secretariat (recovery mandate moves here)">
                Office outside the Secretariat
              </Radio>
            </RadioGroup>
            <TextField label="DDO name" name="ddoName" value={editing.ddoName ?? ''} onChange={(ddoName) => set({ ddoName })} errors={errors} />
            <TextField label="DDO designation" name="ddoDesignation" value={editing.ddoDesignation ?? ''} onChange={(ddoDesignation) => set({ ddoDesignation })} errors={errors} />
          </div>
        )}
      </SideDrawer>
    </>
  );
}
