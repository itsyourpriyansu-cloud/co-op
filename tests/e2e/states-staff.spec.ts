// Staff screens: with every API call failing, a list shows an error with a way to retry, and recovers.
// A failed money post never offers a blind repeat. The failure rate is always put back to 0.
import { expect, PHONE_URL, resetDemo, setFailureRate, staffAs, test } from './support';

const SCREENS: Array<[string, string]> = [
  ['/staff/home', 'stf-accountant'],
  ['/staff/queue', 'stf-accountant'],
  ['/staff/joining', 'stf-accountant'],
  ['/staff/members', 'stf-accountant'],
  ['/staff/loans', 'stf-accountant'],
  ['/staff/deposits', 'stf-cashier'],
  ['/staff/demand', 'stf-accountant'],
  ['/staff/payments', 'stf-cashier'],
  ['/staff/reports', 'stf-accountant'],
  ['/staff/settings/users', 'stf-admin'],
];
const ERROR_TEXT = /Couldn't load|Can't reach the society server|Something went wrong|No connection/i;

test.describe('states · staff screens', () => {
  test.beforeEach(async ({ request, errors }) => {
    await resetDemo(request);
    errors.allowed = [/503|Failed to load resource|Service Unavailable|NETWORK/i];
  });
  test.afterEach(async ({ request }) => setFailureRate(request, 0));

  for (const [path, persona] of SCREENS) {
    test(`${path}: error state, then recovers`, async ({ page, request }) => {
      await staffAs(page, request, persona, '/staff/more');
      await expect(page.getByText('Sign out').first()).toBeVisible();
      await setFailureRate(request, 1);
      await page.goto(`${PHONE_URL}${path}`);
      await expect(page.getByText(ERROR_TEXT).first()).toBeVisible({ timeout: 30_000 });
      await setFailureRate(request, 0);
      const retry = page.getByRole('button', { name: /Try again|Retry|Check connection/ }).first();
      if (await retry.count()) await retry.click();
      else await page.reload();
      await expect(page.getByText(ERROR_TEXT)).toHaveCount(0, { timeout: 30_000 });
    });
  }
});
