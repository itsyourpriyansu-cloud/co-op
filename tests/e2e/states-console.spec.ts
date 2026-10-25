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
