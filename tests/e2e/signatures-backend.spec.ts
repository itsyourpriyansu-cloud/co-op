// F-01 (D-096) against the production backend: a member uploads a signature in the app; a signer
// sees theirs in the console. Skipped when E2E_API_URL points at the mock API.
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { generate } from 'otplib';
import { API, API_URL, apiCall, apiToken, CONSOLE_URL, consoleAs, expect, PHONE_URL, phoneAs, resetDemo, test } from './support';

const PNG = fileURLToPath(new URL('./fixtures/signature.png', import.meta.url));

/** A new Cashier (no authenticator, no signature yet) and the temporary password the Super Admin hands over. */
async function newCashier(request: APIRequestContext, userId: string) {
  const admin = await apiToken(request, 'stf-admin', 'console');
  const users = await apiCall<Array<{ id: string; userId: string }>>(request, 'POST', '/users', admin.token, { name: 'Test Cashier', userId, role: 'CASHIER' });
  const id = users.find((u) => u.userId === userId)!.id;
  const { temporaryPassword } = await apiCall<{ temporaryPassword: string }>(request, 'POST', `/users/${id}/reset-password`, admin.token);
  return temporaryPassword;
}

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

  test('D-126: a new staff member adds a signature as the last sign-in step, and never sees it again', async ({ page, request }) => {
    const userId = `cashier.${Date.now() % 1000000}`;
    const temporaryPassword = await newCashier(request, userId);
    const newPassword = `Counter${Date.now() % 100000}x`;
    await page.goto(`${CONSOLE_URL}/login`);
    await page.getByRole('textbox').nth(0).fill(userId);
    await page.getByRole('textbox').nth(1).fill(temporaryPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // D-127: every staff role sets up an authenticator first.
    await expect(page.getByRole('heading', { name: 'Set up an authenticator app' })).toBeVisible();
    const secret = (await page.locator('p.select-all').textContent())!.replace(/\s/g, '');
    await page.getByRole('textbox').fill(await generate({ secret }));
    await page.getByRole('button', { name: 'Confirm and sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.goto(`${CONSOLE_URL}/dashboard`);
    const boxes = page.getByRole('textbox');
    await boxes.nth(0).fill(temporaryPassword);
    await boxes.nth(1).fill(newPassword);
    await boxes.nth(2).fill(newPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    // The console stays on this step until a signature is on file.
    await expect(page.getByRole('heading', { name: 'Add your signature' })).toBeVisible();
    await page.goto(`${CONSOLE_URL}/loans`);
    await expect(page.getByRole('heading', { name: 'Add your signature' })).toBeVisible();
    await page.getByLabel('Signature image file').setInputFiles(PNG);
    await expect(page.getByRole('img', { name: 'Selected signature, not saved yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('heading', { name: 'Add your signature' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/loans$/);
    await page.reload();
    await expect(page.getByRole('main').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add your signature' })).toHaveCount(0);
  });

  test('D-126: the staff screens of the app ask for the signature too', async ({ page, request }) => {
    const userId = `cashier.${(Date.now() + 7) % 1000000}`;
    const temporaryPassword = await newCashier(request, userId);
    // Password, then the authenticator set-up (D-127), through the API.
    const login = await (await request.post(`${API}/auth/staff/login`, { data: { username: userId, password: temporaryPassword } })).json();
    expect(login.status).toBe('TOTP_SETUP_REQUIRED');
    const { secret } = await (await request.post(`${API}/auth/staff/totp/setup`, { data: { challengeToken: login.challengeToken } })).json();
    const session = await (await request.post(`${API}/auth/staff/totp/confirm`, { data: { challengeToken: login.challengeToken, code: await generate({ secret }) } })).json();
    await page.goto(`${PHONE_URL}/welcome`);
    await page.evaluate((s) => localStorage.setItem('tgs.app.session', JSON.stringify(s)), session);
    await page.goto(`${PHONE_URL}/staff/home`);
    await expect(page.getByText('Add your signature')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload signature' }).click();
    await (await chooser).setFiles(PNG);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Add your signature')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Add your signature')).toHaveCount(0);
  });
});
