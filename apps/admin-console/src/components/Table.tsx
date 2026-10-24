import { DataTable, type DataTableProps } from '@juspay/blend-design-system';

/**
 * Typed wrapper over Blend's DataTable. Blend exports it as a non-generic forwardRef
 * (rows typed as Record<string, unknown>); this restores row typing for columns and callbacks.
 */
export function Table<T extends Record<string, unknown>>(props: DataTableProps<T>) {
  return <DataTable {...(props as unknown as DataTableProps<Record<string, unknown>>)} />;
}
