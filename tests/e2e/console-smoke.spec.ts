// Console smoke (docs/15): every console route renders for a role that may see it, with a heading,
// no error / no-access state and no runtime errors. Screenshots land in test-results/screens.
import { CONSOLE_ROUTES, fillIds, seededIds, type Ids } from './routes';
import { consoleAs, CONSOLE_URL, expect, resetDemo, shot, test } from './support';

test.describe('console smoke', () => {
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('login lists the staff personas and signs in', async ({ page }) => {
    await page.goto(`${CONSOLE_URL}/login`);
    await expect(page.getByRole('button', { name: /Anitha Rao/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kiran Kumar/ })).toBeVisible();
    await shot(page, 'console-login');
    await page.getByRole('button', { name: /Suresh Goud/ }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  // One test per route, so a failure names the screen. Detail ids are looked up once per run.
  let ids: Ids | undefined;
  for (const [template, persona] of CONSOLE_ROUTES) {
    test(`route ${template} renders for ${persona}`, async ({ page, request }) => {
      ids ??= await seededIds(request);
      await consoleAs(page, request, persona, fillIds(template, ids));
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByText("We couldn't load this")).toHaveCount(0);
      await expect(page.getByText("You don't have access to this")).toHaveCount(0);
      await shot(page, `route${template.replace(/[/:]/g, '_')}`);
    });
  }

  test('DDO sees only their department and no Deposits or Reports', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-ddo-fin');
    const nav = page.getByRole('navigation');
    await expect(nav.getByText('Deposits')).toHaveCount(0);
    await expect(nav.getByText('Reports')).toHaveCount(0);
    await page.goto(`${CONSOLE_URL}/deposits`);
    await expect(page.getByText("You don't have access to this")).toBeVisible();
  });

  test('dark mode applies tokens', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-secretary');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await shot(page, 'dashboard-dark');
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  });
});
