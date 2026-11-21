// Step 4 · screen sizes: the console at laptop sizes (1366×768, 1280×800, and with the sidebar
// collapsed) has no horizontal page scroll and no header buttons cut off; print pages still render.
// The Member App at 360×740 has no horizontal scroll.
import type { Page } from '@playwright/test';
import { CONSOLE_ROUTES, fillIds, PHONE_SCREENS, seededIds, type Ids } from './routes';
import { consoleAs, CONSOLE_URL, expect, PHONE_URL, phoneAs, phoneSettled, phoneSignOut, resetDemo, shot, test } from './support';

/** Page-level horizontal overflow (tables scroll inside their own box, which is fine). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement!;
    const mains = Array.from(document.querySelectorAll('main, [role="main"]')) as HTMLElement[];
    const worst = Math.max(doc.scrollWidth - doc.clientWidth, ...mains.map((m) => m.scrollWidth - m.clientWidth));
    // Buttons in the page header that end beyond the viewport.
    const clipped = (Array.from(document.querySelectorAll('header button, h1')) as HTMLElement[])
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1;
      })
      .map((el) => (el.textContent ?? '').trim().slice(0, 40));
    return { worst, clipped };
  });
}

const MAIN_PAGES = ['/dashboard', '/queue', '/joining', '/members', '/members/:member', '/loans', '/loans/new', '/loans/:loan', '/deposits', '/deposits/:deposit', '/demand-sheets', '/demand-sheets/:sheet', '/payments', '/payments/new', '/reports', '/reports/:report', '/notifications', '/settings/loan-products'];

test.describe('screen sizes', () => {
  test.beforeAll(async ({ request }) => resetDemo(request));
  let ids: Ids | undefined;

  for (const size of [
    { width: 1366, height: 768, collapsed: false },
    { width: 1280, height: 800, collapsed: false },
    { width: 1280, height: 800, collapsed: true },
  ]) {
    const label = `${size.width}×${size.height}${size.collapsed ? ' collapsed' : ''}`;
    test(`console ${label}: no horizontal scroll or clipped headers`, async ({ page, request }) => {
      test.setTimeout(240_000);
      ids ??= await seededIds(request);
      await page.setViewportSize({ width: size.width, height: size.height });
      const problems: string[] = [];
      for (const template of MAIN_PAGES) {
        const persona = CONSOLE_ROUTES.find(([t]) => t === template)?.[1] ?? 'stf-admin';
        await consoleAs(page, request, persona, fillIds(template, ids));
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
        if (size.collapsed) {
          // Blend's "/" shortcut; the collapsed state is not kept across page loads, so collapse every page.
          const sidebarWidth = () => page.evaluate(() => document.querySelector('[data-element="sidebar-panel"]')?.getBoundingClientRect().right ?? 0);
          const before = await sidebarWidth();
          await page.locator('h1').first().click();
          await page.keyboard.press('/');
          await expect.poll(sidebarWidth, { message: `${template}: sidebar collapses` }).toBeLessThan(before);
          await page.waitForTimeout(400); // width animation
        }
        const o = await overflow(page);
        if (o.worst > 1) problems.push(`${template}: page scrolls sideways by ${o.worst}px`);
        if (o.clipped.length) problems.push(`${template}: clipped ${o.clipped.join(' | ')}`);
        await shot(page, `size-${size.width}${size.collapsed ? 'c' : ''}${template.replace(/[/:]/g, '_')}`);
      }
      expect(problems).toEqual([]);
    });
  }

  // D-140: a print is the document alone (no sidebar or topbar), not clipped to one screen, with the seal.
  test('print pages print the document alone, unclipped, with the seal', async ({ page, request }) => {
    test.setTimeout(240_000);
    ids ??= await seededIds(request);
    await page.setViewportSize({ width: 1280, height: 800 });
    const PRINTS = ['/deposits/:deposit/fdr', '/payments/:receipt', '/loans/:loan/letter', '/demand-sheets/:sheet', '/reports/:report', '/reports/print/loan-form?loan=:loan', '/reports/print/loan-bond?loan=:loan', '/reports/print/fd-form?deposit=:deposit', '/reports/print/membership?member=:member', '/reports/print/agreement?member=:member', '/reports/print/defaulter-notice?member=:member'];
    const problems: string[] = [];
    await consoleAs(page, request, 'stf-admin');
    for (const template of PRINTS) {
      await page.emulateMedia({ media: 'screen' });
      await page.goto(`${CONSOLE_URL}${fillIds(template, ids)}`);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
      // A seeded record from before the app has no letter yet; that page shows its empty state instead.
      if (await page.getByRole('heading', { name: /^No .* yet$/ }).count()) continue;
      await page.emulateMedia({ media: 'print' });
      const seal = page.getByAltText('TGSECCSL seal').first();
      await expect(seal, `${template}: seal`).toBeVisible();
      const p = await page.evaluate(() => {
        const main = document.querySelector('[data-main-content]') as HTMLElement;
        const sidebar = document.querySelector('nav[data-sidebar]');
        return {
          sidebar: sidebar ? getComputedStyle(sidebar).display : 'none',
          clipped: main.scrollHeight - main.clientHeight,
          seal: (document.querySelector('img[alt="TGSECCSL seal"]') as HTMLImageElement | null)?.naturalWidth ?? 0,
        };
      });
      if (p.sidebar !== 'none') problems.push(`${template}: sidebar prints`);
      if (p.clipped > 1) problems.push(`${template}: clipped by ${p.clipped}px`);
      if (!p.seal) problems.push(`${template}: seal image not loaded`);
      await shot(page, `print${template.replace(/[/:?=]/g, '_')}`);
    }
    expect(problems).toEqual([]);
  });

  test('phone 360×740: no horizontal scroll', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
    const page = await ctx.newPage();
    const problems: string[] = [];
    for (const [path, persona] of PHONE_SCREENS) {
      if (persona) await phoneAs(page, request, persona, path);
      else {
        await page.goto(`${PHONE_URL}/welcome`);
        await phoneSignOut(page);
        await page.goto(`${PHONE_URL}${path}`);
      }
      await phoneSettled(page);
      const w = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
      if (w > 1) problems.push(`${path}: ${w}px`);
      await page.screenshot({ path: `test-results/screens/phone360${path.replace(/\//g, '-')}.png` });
    }
    await ctx.close();
    expect(problems).toEqual([]);
  });
});
