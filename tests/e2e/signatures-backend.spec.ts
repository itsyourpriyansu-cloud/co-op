// F-01 (D-096) against the production backend: a member uploads a signature in the app; a signer
// sees theirs in the console. Skipped when E2E_API_URL points at the mock API.
import { fileURLToPath } from 'node:url';
import { API_URL, consoleAs, expect, phoneAs, resetDemo, test } from './support';

const PNG = fileURLToPath(new URL('./fixtures/signature.png', import.meta.url));

test.describe('signatures · backend', () => {
  test.beforeAll(async ({ request }) => {
    const health = await (await request.get(`${API_URL}/health`)).json();
    test.skip(health.service !== 'tgseccsl-backend', 'needs the backend (E2E_API_URL)');
  });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('a member replaces their signature from Profile → My signature', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1103', '/profile/signature');
    await expect(page.getByRole('img', { name: 'Your signature' })).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Replace signature' }).click();
    await (await chooser).setFiles(PNG);
    // Nothing is saved until Submit (D-122).
    await expect(page.getByRole('img', { name: 'Selected signature, not saved yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/^Uploaded /)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Your signature' })).toBeVisible();
  });

  test('the Secretary opens My signature in the console and uploads one', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-secretary');
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByText('My signature').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('img', { name: 'Your signature' })).toBeVisible();
    await drawer.getByLabel('Signature image file').setInputFiles(PNG);
    // Nothing is saved until Submit (D-122).
    await expect(drawer.getByRole('img', { name: 'Selected signature, not saved yet' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Submit' }).click();
    await expect(drawer.getByText(/^Uploaded /)).toBeVisible();
  });
});
