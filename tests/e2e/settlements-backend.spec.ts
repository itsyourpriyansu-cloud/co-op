// F-08 (D-098) against the production backend: a member retires, the settlement letter shows what is
// owed and held, and the Accountant posts it. Skipped when E2E_API_URL points at the mock API.
import { API_URL, consoleAs, expect, resetDemo, test } from './support';

test.describe('final settlement · backend', () => {
  test.beforeAll(async ({ request }) => {
    const health = await (await request.get(`${API_URL}/health`)).json();
    test.skip(health.service !== 'tgseccsl-backend', 'needs the backend (E2E_API_URL)');
  });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('a member retires; the Accountant prints the letter and posts the settlement', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/members/1104');
    await page.getByRole('button', { name: 'Member leaves' }).click();
    await page.getByRole('button', { name: 'Retired' }).or(page.getByRole('radio', { name: 'Retired' })).first().click();
    await page.getByLabel('Date').fill('2026-10-24');
    await page.getByRole('button', { name: 'Mark as left' }).click();
    await expect(page.getByRole('heading', { name: /FINAL SETTLEMENT · RETIRED MEMBER/ })).toBeVisible();
    await expect(page.getByText('Due to the society')).toBeVisible();
    await expect(page.getByText('Held by the society for the member')).toBeVisible();
    await page.getByLabel('Cheque / transfer reference').fill('CHQ-1104');
    await page.getByRole('button', { name: 'Post the settlement' }).click();
    await expect(page.getByText(/^Posted .* ref CHQ-1104/)).toBeVisible();
  });
});
