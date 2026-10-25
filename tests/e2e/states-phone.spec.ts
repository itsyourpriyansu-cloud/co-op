// Member App states: with every API call failing, each screen shows an error or offline state with a
// way to retry, and recovers when the network is back. The failure rate is always put back to 0.
import { expect, PHONE_URL, phoneAs, resetDemo, setFailureRate, test } from './support';

const SCREENS: Array<[string, string]> = [
  ['/home', 'mem-1101'],
  ['/loans', 'mem-1101'],
  ['/deposits', 'mem-1101'],
  ['/payments', 'mem-1104'],
  ['/surety', 'mem-1103'],
  ['/profile', 'mem-1101'],
  ['/rates', 'mem-1101'],
  ['/account/calculators', 'mem-1101'],
  ['/account/notifications', 'mem-1101'],
  ['/account/help', 'mem-1101'],
  ['/account/settings', 'mem-1101'],
];
const ERROR_TEXT = /Couldn't load|Can't reach the society server|Something went wrong|No connection/i;

test.describe('states · phone', () => {
  test.beforeEach(async ({ request, errors }) => {
    await resetDemo(request);
    errors.allowed = [/503|Failed to load resource|Service Unavailable|NETWORK/i];
  });
  test.afterEach(async ({ request }) => setFailureRate(request, 0));

  for (const [path, persona] of SCREENS) {
    test(`${path}: error state, then recovers`, async ({ page, request }) => {
      await phoneAs(page, request, persona, '/more');
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
