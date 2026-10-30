import { describe, expect, it } from 'vitest';
import { PERMISSION_LABELS, permissionsFor, ROLE_PERMISSIONS } from './permissions';

describe('permission map (docs/03 §2)', () => {
  it('gives each role its list, and every key has a label', () => {
    expect(permissionsFor('ACCOUNTANT')).toBe(ROLE_PERMISSIONS.ACCOUNTANT);
    expect(permissionsFor('DDO')).not.toContain('reports.view');
    const labelled = new Set(PERMISSION_LABELS.map((p) => p.key));
    for (const keys of Object.values(ROLE_PERMISSIONS)) for (const k of keys) if (!k.startsWith('app.')) expect(labelled.has(k)).toBe(true);
  });
});
