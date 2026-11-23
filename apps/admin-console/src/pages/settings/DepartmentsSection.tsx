// ST-67 Departments & DDOs: who certifies and deducts for each office (incl. external offices
// for members transferred out of the Secretariat, Q-512). A department may have many DDO logins (added in
// Users); the Admin picks the one in charge here, and every DDO task goes to that one (D-142).
// DDO setup (D-145): one DDO for all departments, or a DDO in charge per department.
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2Type, ColumnType, Radio, RadioGroup, SingleSelectV2, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, type ColumnDefinition } from '@juspay/blend-design-system';
import type { Department, DepartmentRow, SocietySettings, StaffUser } from '@tgs/types';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { Panel } from '@/components/Panel';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

type Row = DepartmentRow & Record<string, unknown>;
const EMPTY: Partial<Department> = { code: '', name: '', kind: 'SECRETARY_DEPT', ddoName: '', ddoDesignation: 'Assistant Secretary to Government' };

export function DepartmentsSection({ canEdit }: { canEdit: boolean }) {
  const list = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const users = useQuery({ queryKey: ['users'], queryFn: api.settings.users });
  const [editing, setEditing] = useState<Partial<Department> | null>(null);
  const save = useSettingsSave((d: Partial<Department>) => (d.id ? api.settings.updateDepartment(d.id, d) : api.settings.createDepartment(d)), 'Department saved', ['departments']);
  const errors = fieldErrorsOf(save.error);
  const set = (patch: Partial<Department>) => setEditing((e) => ({ ...e, ...patch }));
  /** Active DDO logins of a department, longest-standing first (the list keeps creation order). */
  const ddosOf = (deptId?: string): StaffUser[] => (users.data ?? []).filter((u) => u.role === 'DDO' && u.departmentId === deptId && u.active !== false);
  const editingDdos = ddosOf(editing?.id);
  const userOf = (id?: string) => (users.data ?? []).find((u) => u.id === id);
  const deptName = (id?: string) => (list.data ?? []).find((d) => d.id === id)?.name;

  // DDO setup (D-145). The table follows the saved mode; the panel holds unsaved edits until Save.
  const bundle = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const single = bundle.data?.settings.ddoMode === 'SINGLE';
  const allDdos = (users.data ?? []).filter((u) => u.role === 'DDO' && u.active !== false);
  /** The DDO login doing all departments' DDO work now (the server's choice or fallback). */
  const singleNow = single ? userOf(list.data?.find((d) => d.ddoUserId)?.ddoUserId) : undefined;
  const [setup, setSetup] = useState<{ ddoMode: 'PER_DEPARTMENT' | 'SINGLE'; singleDdoUserId: string } | null>(null);
  const picked = setup ?? { ddoMode: single ? 'SINGLE' : 'PER_DEPARTMENT', singleDdoUserId: singleNow?.id ?? '' };
  // The first DDO login stays pre-selected even when the users list loads after the radio was clicked.
  const shown = { ...picked, singleDdoUserId: picked.singleDdoUserId || (picked.ddoMode === 'SINGLE' ? (allDdos[0]?.id ?? '') : '') };
  const saveSetup = useSettingsSave((p: Partial<SocietySettings>) => api.settings.updateValues(p), 'DDO setup saved', ['departments']);
  const setupErrors = saveSetup.fieldErrors;

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
      header: single ? 'DDO on printed forms' : 'DDO',
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
    {
      field: 'ddoUserId',
      header: single ? 'DDO in charge' : 'DDO logins',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      minWidth: '200px',
      renderCell: (_v, r) => {
        if (single) {
          const u = userOf(r.ddoUserId);
          if (!u) return <span className="text-caption text-fg-tertiary">No DDO login yet · add one in Users</span>;
          return (
            <div aria-label={`${u.name} · ${u.userId} · all departments`}>
              <p className="text-body text-fg">{u.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-caption text-fg-tertiary">{u.userId}</span>
                <span className="shrink-0">
                  <TagV2 text="All departments" size={TagV2Size.XS} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                </span>
              </div>
            </div>
          );
        }
        const logins = ddosOf(r.id);
        if (!logins.length) return <span className="text-caption text-fg-tertiary">No login yet · add one in Users</span>;
        return (
          <ul className="flex flex-col gap-1.5">
            {[...logins].sort((a, b) => Number(b.id === r.ddoUserId) - Number(a.id === r.ddoUserId)).map((u) => (
              <li key={u.id} aria-label={`${u.name} · ${u.userId}${u.id === r.ddoUserId ? ' · in charge' : ''}`}>
                <p className={u.id === r.ddoUserId ? 'text-body text-fg' : 'text-body text-fg-secondary'}>{u.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-caption text-fg-tertiary">{u.userId}</span>
                  {u.id === r.ddoUserId && (
                    <span className="shrink-0">
                      <TagV2 text="In charge" size={TagV2Size.XS} color={TagV2Color.SUCCESS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        );
      },
    },
    { field: 'memberCount', header: 'Members', type: ColumnType.NUMBER, width: '110px' },
    ...(canEdit
      ? [{ field: 'id' as const, header: '', type: ColumnType.REACT_ELEMENT, isSortable: false, width: '90px', renderCell: (_v: unknown, r: Row) => <ButtonV2 text="Edit" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={14} /> }} onClick={() => setEditing(r)} /> } satisfies ColumnDefinition<Row>]
      : []),
  ];

  return (
    <>
      <div className="mb-6">
        <Panel
          title="DDO setup"
          subtitle="Who certifies applications, agrees salary-recovery mandates and receives the monthly demand sheets. A change applies from the next task."
          action={
            canEdit && setup ? (
              <div className="flex shrink-0 gap-2">
                <ButtonV2 text="Discard" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} onClick={() => (setSetup(null), saveSetup.reset())} />
                <ButtonV2
                  text="Save"
                  size={ButtonV2Size.SMALL}
                  loading={saveSetup.isPending}
                  onClick={() => saveSetup.mutate({ ddoMode: shown.ddoMode, ...(shown.ddoMode === 'SINGLE' && shown.singleDdoUserId ? { singleDdoUserId: shown.singleDdoUserId } : {}) }, { onSuccess: () => setSetup(null) })}
                />
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <RadioGroup
              name="ddoMode"
              label="DDO work is done by"
              value={shown.ddoMode}
              disabled={!canEdit}
              onChange={(v) => setSetup({ ddoMode: v as 'PER_DEPARTMENT' | 'SINGLE', singleDdoUserId: shown.singleDdoUserId || allDdos[0]?.id || '' })}
            >
              <Radio value="PER_DEPARTMENT" subtext="Each department's DDO in charge handles its own members. Choose them with Edit in the table below.">
                A DDO for each department
              </Radio>
              <Radio value="SINGLE" subtext="One DDO login handles every department's members and sees every department's records.">
                One DDO for all departments
              </Radio>
            </RadioGroup>
            {shown.ddoMode === 'SINGLE' &&
              (allDdos.length ? (
                <div className="max-w-md">
                  <SingleSelectV2
                    label="DDO for all departments"
                    placeholder="Choose"
                    disabled={!canEdit}
                    items={[{ items: allDdos.map((u) => ({ label: `${u.name} · ${u.userId}${deptName(u.departmentId) ? ` · ${deptName(u.departmentId)}` : ''}`, value: u.id })) }]}
                    selected={shown.singleDdoUserId}
                    onSelect={(id) => setSetup({ ddoMode: 'SINGLE', singleDdoUserId: id })}
                    {...(setupErrors.singleDdoUserId ? { error: { show: true, message: setupErrors.singleDdoUserId } } : {})}
                  />
                </div>
              ) : (
                <p className="text-caption text-fg-tertiary">No DDO login yet. Add one in Users (role DDO), then choose it here.</p>
              ))}
            {setupErrors.ddoMode && (
              <p role="alert" className="text-caption text-danger-fg">
                {setupErrors.ddoMode}
              </p>
            )}
          </div>
        </Panel>
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">{list.data ? `${list.data.length} offices · DDOs certify membership and loan applications and deduct dues from salary.` : ' '}</p>
        {canEdit && <ButtonV2 text="Add department" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => setEditing({ ...EMPTY })} />}
      </div>
      <ViewState state={list.isLoading || users.isLoading ? 'loading' : list.isError ? 'error' : 'ready'} layout="table" onRetry={() => void list.refetch()}>
        {/* Blend keeps rendered cells until its data changes, so redraw when the DDO logins change (D-142). */}
        <Table<Row> key={users.dataUpdatedAt} data={(list.data ?? []) as Row[]} columns={columns} idField="id" isHoverable showToolbar={false} />
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
            {editing.id && single && (
              <p className="text-caption text-fg-tertiary">
                One DDO for all departments is on: {singleNow ? `${singleNow.name} (${singleNow.userId})` : 'the first DDO login added'} does this office's DDO work. Change it under DDO setup.
              </p>
            )}
            {editing.id &&
              !single &&
              (editingDdos.length ? (
                <div className="flex flex-col gap-1">
                  <SingleSelectV2
                    label="DDO in charge"
                    placeholder="Choose"
                    items={[{ items: editingDdos.map((u) => ({ label: `${u.name} · ${u.userId}`, value: u.id })) }]}
                    selected={editingDdos.some((u) => u.id === editing.ddoUserId) ? editing.ddoUserId! : ''}
                    onSelect={(id) => set({ ddoUserId: id, ddoName: editingDdos.find((u) => u.id === id)?.name ?? editing.ddoName })}
                    {...(errors.ddoUserId ? { error: { show: true, message: errors.ddoUserId } } : {})}
                  />
                  <p className="text-caption text-fg-tertiary">
                    {editingDdos.length} DDO login{editingDdos.length === 1 ? '' : 's'} in this department. Only the one in charge gets its certifications, mandates and demand sheets.
                  </p>
                </div>
              ) : (
                <p className="text-caption text-fg-tertiary">No DDO login in this department yet. Add one in Users (role DDO), then choose who is in charge here.</p>
              ))}
            <TextField label="DDO name" name="ddoName" value={editing.ddoName ?? ''} onChange={(ddoName) => set({ ddoName })} errors={errors} />
            <TextField label="DDO designation" name="ddoDesignation" value={editing.ddoDesignation ?? ''} onChange={(ddoDesignation) => set({ ddoDesignation })} errors={errors} />
          </div>
        )}
      </SideDrawer>
    </>
  );
}
