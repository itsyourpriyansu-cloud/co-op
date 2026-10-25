// ST-61 Users: staff logins, their role (Secretary and President are separate users, D-037) and,
// for DDOs, their department.
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2Type, ColumnType, Radio, RadioGroup, Switch, SwitchSize, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, type ColumnDefinition } from '@juspay/blend-design-system';
import { CONSOLE_ROLES, ROLE_LABELS, type ConsoleRole, type StaffUser } from '@tgs/types';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSettingsSave } from './shared';
import { Initials } from '@/components/Initials';

type Row = StaffUser & Record<string, unknown>;

const ROLE_HINT: Record<ConsoleRole, string> = {
  SUPER_ADMIN: 'Settings, users, everything read-only otherwise',
  ACCOUNTANT: 'Reviews, assessment, demand sheets, recoveries',
  SECRETARY: 'First signature on loans, FDs and memberships',
  PRESIDENT: 'Final signature (must differ from the Secretary)',
  CASHIER: 'Receipts with denominations, disbursements',
  DDO: 'Certifies applications for one department',
};

export function UsersSection({ canEdit }: { canEdit: boolean }) {
  const users = useQuery({ queryKey: ['users'], queryFn: api.settings.users });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const [editing, setEditing] = useState<Partial<StaffUser> | null>(null);
  const save = useSettingsSave((u: Partial<StaffUser>) => (u.id ? api.settings.updateUser(u.id, u) : api.settings.createUser(u)), 'User saved');
  const errors = fieldErrorsOf(save.error);
  const set = (patch: Partial<StaffUser>) => setEditing((e) => ({ ...e, ...patch }));
  const deptName = (id?: string) => depts.data?.find((d) => d.id === id)?.name;

  const columns: ColumnDefinition<Row>[] = [
    {
      field: 'name',
      header: 'Name',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      minWidth: '220px',
      renderCell: (_v, r) => (
        <div className="flex items-center gap-3">
          <Initials name={r.name} size="sm" />
          <div>
            <p className="text-label text-fg">{r.name}</p>
            <p className="text-caption text-fg-tertiary">{r.userId}</p>
          </div>
        </div>
      ),
    },
    { field: 'role', header: 'Role', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="text-body text-fg">{ROLE_LABELS[r.role]}</span> },
    { field: 'departmentId', header: 'Department', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="text-body text-fg-secondary">{deptName(r.departmentId) ?? '—'}</span> },
    {
      field: 'active',
      header: 'Status',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => <TagV2 text={r.active === false ? 'Inactive' : 'Active'} size={TagV2Size.XS} color={r.active === false ? TagV2Color.NEUTRAL : TagV2Color.SUCCESS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />,
    },
    ...(canEdit
      ? [{ field: 'id' as const, header: '', type: ColumnType.REACT_ELEMENT, isSortable: false, width: '90px', renderCell: (_v: unknown, r: Row) => <ButtonV2 text="Edit" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={14} /> }} onClick={() => setEditing(r)} /> } satisfies ColumnDefinition<Row>]
      : []),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">Staff sign in to the Admin Console only. Members use the app (D-033).</p>
        {canEdit && <ButtonV2 text="Add user" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => setEditing({ role: 'ACCOUNTANT', active: true })} />}
      </div>
      <ViewState state={users.isLoading ? 'loading' : users.isError ? 'error' : 'ready'} layout="table" onRetry={() => void users.refetch()}>
        <Table<Row> data={(users.data ?? []) as Row[]} columns={columns} idField="id" isHoverable showToolbar={false} />
      </ViewState>
      <SideDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add user'}
        description="Demo: new users can be managed here; the login screen keeps the six demo personas."
        footer={
          <div className="flex justify-end gap-2">
            <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={() => setEditing(null)} />
            <ButtonV2 text="Save" loading={save.isPending} onClick={() => editing && save.mutate(editing, { onSuccess: () => setEditing(null) })} />
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Full name" name="name" value={editing.name ?? ''} onChange={(name) => set({ name })} errors={errors} />
              <TextField label="User ID" name="userId" value={editing.userId ?? ''} onChange={(userId) => set({ userId: userId.toLowerCase() })} errors={errors} placeholder="e.g. ddo.gad" />
              <TextField label="Mobile (optional)" name="mobile" value={editing.mobile ?? ''} onChange={(mobile) => set({ mobile: mobile.replace(/\D/g, '').slice(0, 10) })} errors={errors} />
              <TextField label="Email (optional)" name="email" value={editing.email ?? ''} onChange={(email) => set({ email })} errors={errors} />
            </div>
            <RadioGroup name="role" label="Role" value={editing.role ?? ''} onChange={(role) => set({ role: role as ConsoleRole })} error={Boolean(errors.role)}>
              {CONSOLE_ROLES.map((r) => (
                <Radio key={r} value={r} subtext={ROLE_HINT[r]}>
                  {ROLE_LABELS[r]}
                </Radio>
              ))}
            </RadioGroup>
            {editing.role === 'DDO' && (
              <section className="flex flex-col gap-2">
                <p className="text-label text-fg">Department</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Department">
                  {(depts.data ?? []).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={editing.departmentId === d.id}
                      onClick={() => set({ departmentId: d.id })}
                      className={cn('rounded-pill border px-3 py-1.5 text-caption-strong transition-colors', editing.departmentId === d.id ? 'border-brand-border bg-brand-subtle text-brand-text' : 'border-line bg-surface text-fg-secondary hover:bg-surface-subtle')}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                {errors.departmentId && <p className="text-caption text-danger-fg">{errors.departmentId}</p>}
              </section>
            )}
            {editing.id && <Switch checked={editing.active !== false} onChange={(active) => set({ active })} size={SwitchSize.MEDIUM} label="Can sign in" subtext={errors.active} />}
          </div>
        )}
      </SideDrawer>
    </>
  );
}
