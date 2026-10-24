// Console smoke: every built screen renders with real mock data, role scoping works, no runtime
// errors, and full-page screenshots land in test-results/screens for visual review.
import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForURL('**/dashboard');
}

test('login lists the staff personas', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Anitha Rao/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Kiran Kumar/ })).toBeVisible();
  await shot(page, '01-login');
  expect(errors).toEqual([]);
});

test('Super Admin dashboard shows live KPIs and the full navigation', async ({ page }) => {
  const errors = trackErrors(page);
  await signInAs(page, 'Anitha Rao');
  await expect(page.getByText('Active members')).toBeVisible();
  await expect(page.getByText('Loan pipeline')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Deposits')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '02-dashboard-admin');
  expect(errors).toEqual([]);
});

test('DDO sees only their department and no Deposits or Reports', async ({ page }) => {
  await signInAs(page, 'Kiran Kumar');
  await expect(page.getByText('your department only')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Deposits')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByText('Reports')).toHaveCount(0);
  await page.goto('/deposits');
  await expect(page.getByText("You don't have access to this")).toBeVisible();
  await shot(page, '03-ddo-no-access');
});

test('module skeleton page explains its milestone', async ({ page }) => {
  await signInAs(page, 'Suresh Goud');
  await page.goto('/loans');
  await expect(page.getByText('Loans is next on the build plan')).toBeVisible();
  await shot(page, '04-module-loans');
});

test('design system: every tab renders', async ({ page }) => {
  const errors = trackErrors(page);
  await signInAs(page, 'Anitha Rao');
  for (const tab of ['foundations', 'components', 'status', 'states', 'scenarios']) {
    await page.goto(`/design?tab=${tab}`);
    await page.waitForTimeout(600);
    await shot(page, `05-design-${tab}`);
  }
  await expect(page.getByText(/scenarios generated from the dataset/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('state explorer renders each state for the list pattern', async ({ page }) => {
  await signInAs(page, 'Anitha Rao');
  for (const state of ['loading', 'empty', 'error', 'partial']) {
    await page.goto(`/design?tab=states&pattern=list&state=${state}`);
    await page.waitForTimeout(400);
    await shot(page, `06-state-list-${state}`);
  }
  await page.goto('/design?tab=states&pattern=detail&state=ready');
  await page.waitForTimeout(400);
  await shot(page, '06-state-detail-ready');
});

test('dark mode applies tokens and Blend dark theme', async ({ page }) => {
  await signInAs(page, 'Padma Reddy');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(400);
  await shot(page, '07-dashboard-dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
});

test('scenario catalog jumps to a persona', async ({ page }) => {
  await signInAs(page, 'Anitha Rao');
  await page.goto('/design?tab=scenarios');
  await page.getByRole('button', { name: /Padma Reddy · Secretary/ }).first().click();
  await page.waitForURL('**/loans');
  await expect(page.getByText('Padma Reddy').first()).toBeVisible();
});
