// WCAG 2.2 AA on every Member App screen (Expo web build at phone size): no critical / serious.
import AxeBuilder from '@axe-core/playwright';
import { PHONE_SCREENS } from './routes';
import { expect, PHONE_URL, phoneAs, phoneSettled, phoneSignOut, resetDemo, test } from './support';

test.describe('accessibility · phone', () => {
  test.beforeAll(async ({ request }) => resetDemo(request));
  for (const [path, persona] of PHONE_SCREENS) {
    test(`${path}${persona ? ` (${persona})` : ''}`, async ({ page, request }, info) => {
      if (persona) await phoneAs(page, request, persona, path);
      else {
        await page.goto(`${PHONE_URL}/welcome`);
        await phoneSignOut(page);
        await page.goto(`${PHONE_URL}${path}`);
      }
      // react-native-web renders text as divs; wait until the screen has content and no skeletons.
      await phoneSettled(page);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      await info.attach('axe', { body: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target })), null, 2), contentType: 'application/json' });
      const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(bad.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`), `axe ${path}`).toEqual([]);
    });
  }
});
