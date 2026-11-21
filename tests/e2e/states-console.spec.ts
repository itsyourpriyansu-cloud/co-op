// State contract (docs/04 §6, docs/19): with every API call failing, each list shows an error with a
// way to retry — on a full reload and after in-app navigation. No-results on a filtered list.
// The failure rate is always put back to 0.
import { consoleAs, CONSOLE_URL, expect, resetDemo, setFailureRate, test } from './support';

const LISTS: Array<[string, string, string]> = [
  ['Work Queue', '/queue', 'stf-accountant'],
  ['Joining', '/joining', 'stf-accountant'],
  ['Members', '/members', 'stf-accountant'],
  ['Loans', '/loans', 'stf-accountant'],
  ['Deposits', '/deposits', 'stf-cashier'],
  ['Demand Sheets', '/demand-sheets', 'stf-accountant'],
  ['Payments', '/payments', 'stf-cashier'],
  ['Reports', '/reports', 'stf-accountant'],
];
const RETRY = /Try again|Retry/;

test.describe('states · console', () => {
  test.beforeEach(async ({ request, errors }) => {
    await resetDemo(request);
    // Simulated 503s are logged by the browser; that is the point of this spec.
    errors.allowed = [/503|Failed to load resource|Service Unavailable|NETWORK/i];
  });
  test.afterEach(async ({ request }) => setFailureRate(request, 0));

  for (const [label, path, persona] of LISTS) {
    test(`${label}: error with retry on reload, then recovers`, async ({ page, request }) => {
      await consoleAs(page, request, persona, path);
      await setFailureRate(request, 1);
      await page.reload();
      await expect(page.getByRole('button', { name: RETRY }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/You don't have access/)).toHaveCount(0);
      await setFailureRate(request, 0);
      await page.getByRole('button', { name: RETRY }).first().click();
      await expect(page.getByRole('button', { name: RETRY })).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });
  }

  test('in-app navigation: each list shows its own error state', async ({ page, request }) => {
    test.setTimeout(180_000);
    await consoleAs(page, request, 'stf-accountant', '/dashboard');
    // The menu is built from the user's permissions: let them load before every call starts failing.
    await expect(page.getByRole('navigation').getByText(/^Work Queue/).first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    await setFailureRate(request, 1);
    for (const [label] of LISTS.filter(([, , p]) => p === 'stf-accountant')) {
      await page.getByRole('navigation').getByText(new RegExp(`^${label}`)).first().click();
      await expect(page.getByRole('button', { name: RETRY }).first(), label).toBeVisible({ timeout: 30_000 });
    }
  });

  test('no results on a filtered list', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/members');
    await page.getByPlaceholder(/Search name, General No/).fill('zzzz-nobody');
    await expect(page.getByText('No matches for these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByText('No matches for these filters')).toHaveCount(0);
  });

  test('a fresh page load with failures still reaches a Retry (not "no access")', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/dashboard');
    await setFailureRate(request, 1);
    await page.goto(`${CONSOLE_URL}/loans`);
    await expect(page.getByRole('button', { name: RETRY }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/You don't have access/)).toHaveCount(0);
  });
});

// D-144: the sign-in fields match the phone (D-143). The server's sign-in answers are stubbed so this
// runs on the mock API too, which shows demo personas instead of the password form.
test.describe('sign-in fields · console', () => {
  test.beforeEach(async ({ page }) => {
    const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/health', (r) => r.fulfill(json({ ok: true, service: 'tgseccsl-backend', version: 'test', today: '2026-11-21' })));
    await page.route('**/auth/staff/login', (r) => r.fulfill(json({ status: 'TOTP_REQUIRED', challengeToken: 'c', mustChangePassword: false })));
  });

  test('the password eye shows and hides what was typed', async ({ page }) => {
    await page.goto(`${CONSOLE_URL}/login`);
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('Typo1234x');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Typo1234x');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('the authenticator code is six equal, outlined boxes: typing moves on, a paste fills them all', async ({ page }) => {
    await page.goto(`${CONSOLE_URL}/login`);
    await page.getByLabel('User ID').fill('president');
    await page.getByLabel('Password', { exact: true }).fill('Secret1234x');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your authenticator code' })).toBeVisible();
    const boxes = page.getByRole('group', { name: /6-digit code/ }).getByRole('textbox');
    await expect(boxes).toHaveCount(6);
    const sizes = await boxes.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
    expect(new Set(sizes.map((s) => s.join())).size).toBe(1);
    expect(sizes[0]![0]).toBeGreaterThanOrEqual(40);
    // Unfocused edges: 1.5 px in the tertiary text colour (5.3:1 on white), not Blend's faint grey.
    await expect(boxes.nth(1)).toHaveCSS('border-top-width', '1.5px');
    await expect(boxes.nth(1)).toHaveCSS('border-top-color', 'rgb(102, 108, 121)');
    await expect(boxes.first()).toBeFocused();
    await page.keyboard.type('123');
    await expect(boxes.nth(3)).toBeFocused();
    const verify = page.getByRole('button', { name: 'Verify and sign in' });
    await expect(verify).toBeDisabled();
    await boxes.first().focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text', '654321');
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(boxes.nth(5)).toHaveValue('1');
    await expect(verify).toBeEnabled();
  });
});
