import { describe, expect, it } from 'vitest';
import { inDepartmentScope, PERMISSION_LABELS, permissionsFor, ROLE_PERMISSIONS } from './permissions';

describe('permission map (docs/03 §2)', () => {
  it('gives each role its list, and every key has a label', () => {
    expect(permissionsFor('ACCOUNTANT')).toBe(ROLE_PERMISSIONS.ACCOUNTANT);
    expect(permissionsFor('DDO')).not.toContain('reports.view');
    const labelled = new Set(PERMISSION_LABELS.map((p) => p.key));
    for (const keys of Object.values(ROLE_PERMISSIONS)) for (const k of keys) if (!k.startsWith('app.')) expect(labelled.has(k)).toBe(true);
  });
});

describe('department scope (docs/03 R5, D-145)', () => {
  it('limits a DDO to its department, except the one DDO for all departments', () => {
    expect(inDepartmentScope({ role: 'DDO', departmentId: 'dept-fin' }, 'dept-fin')).toBe(true);
    expect(inDepartmentScope({ role: 'DDO', departmentId: 'dept-fin' }, 'dept-gad')).toBe(false);
    expect(inDepartmentScope({ role: 'DDO' }, 'dept-gad')).toBe(true);
    expect(inDepartmentScope({ role: 'ACCOUNTANT' }, 'dept-gad')).toBe(true);
  });
});
