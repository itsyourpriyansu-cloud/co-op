// AU-01 against the production backend (docs/22 §5.1, P1b): user ID + password, authenticator
// set-up by QR key, a temporary password replaced at first sign-in, and silent token renewal.
// Skipped when E2E_API_URL points at the mock API (the mock has no password sign-in).
import { generate } from 'otplib';
import { API, API_URL, apiCall, apiToken, CONSOLE_URL, expect, test } from './support';

test.describe('staff sign-in · backend', () => {
  test.beforeAll(async ({ request }) => {
    const health = await (await request.get(`${API_URL}/health`)).json();
    test.skip(health.service !== 'tgseccsl-backend', 'needs the backend (E2E_API_URL)');
  });

  test('President: temporary password → authenticator set-up → new password → signs in again with a code', async ({ page, request }) => {
    test.setTimeout(120_000);
    // The Super Admin hands over a temporary password and a fresh authenticator.
    const admin = await apiToken(request, 'stf-admin', 'console');
    await apiCall(request, 'POST', '/users/stf-president/reset-totp', admin.token);
    const { temporaryPassword } = await apiCall<{ temporaryPassword: string }>(request, 'POST', '/users/stf-president/reset-password', admin.token);
    const newPassword = `Sanction${Date.now() % 100000}x`;

    await page.goto(`${CONSOLE_URL}/login`);
    await page.getByRole('textbox').nth(0).fill('president');
    await page.getByRole('textbox').nth(1).fill(temporaryPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Set up an authenticator app' })).toBeVisible();
    await expect(page.getByAltText(/QR code/)).toBeVisible();
    const secret = (await page.locator('p.select-all').textContent())!.replace(/\s/g, '');
    await page.getByRole('textbox').fill(await generate({ secret }));
    await page.getByRole('button', { name: 'Confirm and sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    // The console stays closed until the password is replaced.
    await page.goto(`${CONSOLE_URL}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    const boxes = page.getByRole('textbox');
    // After a reload the temporary password is asked again (it is never stored).
    await boxes.nth(0).fill(temporaryPassword);
    await boxes.nth(1).fill(newPassword);
    await boxes.nth(2).fill(newPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Narasimha Rao').first()).toBeVisible();

    // Signed out, the next sign-in asks for the authenticator code.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${CONSOLE_URL}/login`);
    await page.getByRole('textbox').nth(0).fill('president');
    await page.getByRole('textbox').nth(1).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your authenticator code' })).toBeVisible();
    await page.getByRole('textbox').fill(await generate({ secret }));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('wrong password shows an error and stays on the form', async ({ page }) => {
    await page.goto(`${CONSOLE_URL}/login`);
    await page.getByRole('textbox').nth(0).fill('accounts');
    await page.getByRole('textbox').nth(1).fill('not-the-password1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText("Couldn't sign in")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an expired access token is renewed without signing out', async ({ page, request }) => {
    const r = await request.post(`${API}/auth/staff/login`, { data: { username: 'accounts', password: 'Society@2026' } });
    const { session } = await r.json();
    await page.goto(`${CONSOLE_URL}/login`);
    await page.evaluate((s) => localStorage.setItem('tgs.console.session', JSON.stringify({ ...s, token: 'expired.access.token' })), session);
    await page.goto(`${CONSOLE_URL}/queue`);
    await expect(page.getByRole('heading', { name: 'Work Queue' })).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('tgs.console.session')!).token as string);
    expect(token.startsWith('eyJ')).toBeTruthy();
  });
});
