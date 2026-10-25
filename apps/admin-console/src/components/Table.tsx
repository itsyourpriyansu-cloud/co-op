import { DataTable, type DataTableProps } from '@juspay/blend-design-system';

/**
 * Typed wrapper over Blend's DataTable. Blend exports it as a non-generic forwardRef
 * (rows typed as Record<string, unknown>); this restores row typing for columns and callbacks.
 */
export function Table<T extends Record<string, unknown>>(props: DataTableProps<T>) {
  // .tgs-datatable: scope for the WCAG contrast lift on Blend's header labels (index.css, D-064).
  return (
    <div className="tgs-datatable">
      <DataTable {...(props as unknown as DataTableProps<Record<string, unknown>>)} />
    </div>
  );
}
