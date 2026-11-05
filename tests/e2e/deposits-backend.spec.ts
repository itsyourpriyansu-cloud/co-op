// P6b (D-086) against the production backend: the Admin configures FD maturity and premature
// withdrawal in Settings, then withdraws an FD early after seeing what it pays.
// Skipped when E2E_API_URL points at the mock API (the feature lives in the backend only).
import { API_URL, apiCall, apiToken, consoleAs, expect, resetDemo, test } from './support';

test.describe('FD premature withdrawal · backend', () => {
  test.beforeAll(async ({ request }) => {
    const health = await (await request.get(`${API_URL}/health`)).json();
    test.skip(health.service !== 'tgseccsl-backend', 'needs the backend (E2E_API_URL)');
  });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('Admin sets a 2-point rate cut (default 1, D-093), previews the settlement and withdraws an FD early', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-admin', '/settings/deposits');
    await expect(page.getByRole('heading', { name: 'Premature withdrawal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'FD maturity' })).toBeVisible();
    const penalty = page.getByLabel('Penalty');
    await penalty.fill('2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeHidden();

    const { token } = await apiToken(request, 'stf-admin', 'console');
    const fds = await apiCall<{ items: Array<{ id: string; pledged: boolean; openedOn: string }> }>(request, 'GET', '/deposits?tab=FD&status=ACTIVE&pageSize=100', token);
    const fd = fds.items.find((x) => !x.pledged && x.openedOn <= '2025-10-01')!;
    await page.goto(`/deposits/${fd.id}`);
    await page.getByRole('button', { name: 'Withdraw early' }).click();
    const d = page.getByRole('dialog');
    await expect(d.getByText('Principal (returned in full)')).toBeVisible();
    await expect(d.getByText(/Penalty \(2 points, rate cut\)/)).toBeVisible();
    await expect(d.getByText('Paid to the member')).toBeVisible();
    await d.getByRole('button', { name: 'Withdraw early' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText(/Withdrawn early on/)).toBeVisible();
    await expect(page.getByText('Premature withdrawal:', { exact: false })).toBeVisible();
  });
});
