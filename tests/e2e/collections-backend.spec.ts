// P7b-1 (D-088) against the production backend: the DDO enters actual deductions online and submits;
// the Accountant reviews and approves-and-posts. Skipped when E2E_API_URL points at the mock API.
import { API_URL, consoleAs, expect, resetDemo, test } from './support';

test.describe('DDO deduction entry · backend', () => {
  test.beforeAll(async ({ request }) => {
    const health = await (await request.get(`${API_URL}/health`)).json();
    test.skip(health.service !== 'tgseccsl-backend', 'needs the backend (E2E_API_URL)');
  });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('DDO enters a partial deduction and submits; the Accountant approves and posts', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-ddo-fin', '/demand-sheets/ds-2026-10-fin');
    await page.getByRole('button', { name: 'Enter deductions' }).click();
    await expect(page.getByRole('heading', { name: /Enter deductions/ })).toBeVisible();
    const first = page.getByLabel(/^Deducted from /).first();
    await first.fill('100');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/Deductions draft saved/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit to the Accountant' }).click();
    await expect(page.getByText(/submitted, waiting for the Accountant/)).toBeVisible();

    await consoleAs(page, request, 'stf-accountant', '/demand-sheets/ds-2026-10-fin');
    await page.getByRole('button', { name: 'Review and post' }).click();
    await expect(page.getByRole('heading', { name: /Review deductions/ })).toBeVisible();
    await expect(page.getByLabel(/^Deducted from /).first()).toHaveValue('100');
    await page.getByRole('button', { name: 'Approve and post' }).click();
    await page.getByRole('button', { name: 'Yes, approve and post' }).click();
    await expect(page.getByText(/recovery posted/i).first()).toBeVisible();

    // P7b-2/3: the member page shows what is owed (penal included) and any defaulter notices.
    await page.goto('/members/1101');
    await expect(page.getByText('Outstanding & notices')).toBeVisible();
    await expect(page.getByText('Total outstanding')).toBeVisible();
  });
});
