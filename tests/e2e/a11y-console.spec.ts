// WCAG 2.2 AA (docs/12, D-035): no critical or serious axe violations on any console route, in
// light and dark mode. Moderate / minor findings are attached to the report for review.
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { CONSOLE_ROUTES, fillIds, seededIds, type Ids } from './routes';
import { consoleAs, CONSOLE_URL, expect, resetDemo, test } from './support';

async function axeCheck(page: Page, info: TestInfo, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  await info.attach(`axe-${label}`, { body: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target })), null, 2), contentType: 'application/json' });
  expect(bad.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`), `axe ${label}`).toEqual([]);
}

test.describe('accessibility · console', () => {
  test.beforeAll(async ({ request }) => resetDemo(request));
  let ids: Ids | undefined;
  for (const theme of ['light', 'dark'] as const) {
    for (const [template, persona] of CONSOLE_ROUTES) {
      test(`${theme} ${template}`, async ({ page, request }, info) => {
        ids ??= await seededIds(request);
        await page.goto(`${CONSOLE_URL}/login`);
        await page.evaluate((t) => localStorage.setItem('tgs.console.theme', t), theme);
        await consoleAs(page, request, persona, fillIds(template, ids));
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await axeCheck(page, info, `${theme}${template}`);
      });
    }
  }
  test('login page', async ({ page }, info) => {
    await page.goto(`${CONSOLE_URL}/login`);
    await expect(page.getByRole('button', { name: /Anitha Rao/ })).toBeVisible();
    await axeCheck(page, info, 'login');
  });
});
