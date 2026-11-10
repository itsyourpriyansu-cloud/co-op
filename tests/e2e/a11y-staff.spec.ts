// WCAG 2.2 AA on every staff screen (Expo web build at phone size): no critical / serious. A screen that
// crashes or gets an HTTP error also fails here, through the error tracker.
import AxeBuilder from '@axe-core/playwright';
import { fillIds, seededIds, STAFF_SCREENS, type Ids } from './routes';
import { expect, phoneSettled, resetDemo, shot, staffAs, test } from './support';

test.describe('accessibility · staff screens', () => {
  let ids: Ids;
  test.beforeAll(async ({ request }) => {
    await resetDemo(request);
    ids = await seededIds(request);
  });
  for (const [template, persona] of STAFF_SCREENS) {
    test(`${template} (${persona})`, async ({ page, request }) => {
      const path = fillIds(template, ids);
      await staffAs(page, request, persona, path);
      await phoneSettled(page);
      expect(new URL(page.url()).pathname, 'stayed on the screen').toBe(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(bad.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`), `axe ${path}`).toEqual([]);

      await shot(page, `staff${path.replaceAll('/', '-')}-${persona}`);

      // docs/23 §4.6: nothing runs off the smallest phone, unless it sits in a sideways scroller.
      await page.setViewportSize({ width: 360, height: 800 });
      await phoneSettled(page);
      const cutOff = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const scrolls = (e: Element) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowX);
        const inScroller = (e: Element) => {
          for (let p = e.parentElement; p; p = p.parentElement) if (scrolls(p)) return true;
          return false;
        };
        return [...document.querySelectorAll('body *')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > width + 1 && !inScroller(e);
          })
          .slice(0, 3)
          .map((e) => (e.textContent || e.tagName).slice(0, 50));
      });
      expect(cutOff, `360 px ${path}`).toEqual([]);
    });
  }
});
