// Shared e2e helpers: URLs from env, an error tracker that fails a test on page / console errors
// (except known Blend library noise), demo-API helpers and fast sign-in for both apps.
import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const CONSOLE_URL = process.env.E2E_CONSOLE_URL ?? 'http://localhost:5180';
export const PHONE_URL = process.env.E2E_PHONE_URL ?? 'http://localhost:8090';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const API = `${API_URL}/api/v1`;
export const OTP = '123456';
export const PASSWORD = 'Society@2026';

/** Library noise we cannot fix in our code (docs/build-history/10-polish.md "Known gaps"). */
const KNOWN_NOISE = [/forwardRef render functions accept exactly two parameters/, /outlineOffset/, /React DevTools/];

export class ErrorTracker {
  readonly errors: string[] = [];
  /** Extra patterns a test expects (e.g. simulated 503s in the states spec). */
  allowed: RegExp[] = [];
  watch(page: Page, label = 'page') {
    page.on('pageerror', (e) => this.add(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.add(`${label} console: ${m.text()}`);
    });
    // Name the request behind a "Failed to load resource" console line.
    page.on('response', async (r) => {
      if (r.status() < 400) return;
      const body = await r.text().catch(() => '');
      this.add(`${label} ${r.status()} ${r.request().method()} ${r.url()} ${body.slice(0, 300)}`);
    });
    return page;
  }
  private add(msg: string) {
    if (KNOWN_NOISE.some((r) => r.test(msg)) || this.allowed.some((r) => r.test(msg))) return;
    this.errors.push(msg);
  }
}

/** `test` with an automatic error check after each test (opt out per test with `errors.allowed`). */
export const test = base.extend<{ errors: ErrorTracker }>({
  errors: async ({ page }, use) => {
    const tracker = new ErrorTracker();
    tracker.watch(page);
    await use(tracker);
    expect(tracker.errors, 'page or console errors').toEqual([]);
  },
});
export { expect };

// ---- demo API --------------------------------------------------------------------------------

export async function resetDemo(request: APIRequestContext) {
  const r = await request.post(`${API}/__demo/reset`);
  expect(r.ok()).toBeTruthy();
  await setFailureRate(request, 0);
}

export async function setFailureRate(request: APIRequestContext, rate: number) {
  const r = await request.post(`${API}/__demo/failure-rate`, { data: { rate } });
  expect(r.ok()).toBeTruthy();
}

export async function apiToken(request: APIRequestContext, personaId: string, channel: 'console' | 'app') {
  const r = await request.post(`${API}/auth/persona`, { data: { personaId, channel } });
  expect(r.ok(), `persona ${personaId}`).toBeTruthy();
  return (await r.json()) as { token: string; user: { id: string; name: string } };
}

export async function apiCall<T = unknown>(request: APIRequestContext, method: 'GET' | 'POST' | 'PUT', path: string, token?: string, data?: unknown): Promise<T> {
  const r = await request.fetch(`${API}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(data !== undefined ? { data } : {}) });
  expect(r.ok(), `${method} ${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()) as T;
}

// ---- sign-in ---------------------------------------------------------------------------------

/** Console: sign in through the API and put the session in storage (the login screen has its own test). */
export async function consoleAs(page: Page, request: APIRequestContext, personaId: string, path = '/dashboard') {
  const session = await apiToken(request, personaId, 'console');
  await page.goto(`${CONSOLE_URL}/login`);
  await page.evaluate((s) => localStorage.setItem('tgs.console.session', JSON.stringify(s)), session);
  await page.goto(`${CONSOLE_URL}${path}`);
  await expect(page.getByRole('main').first()).toBeVisible();
  return session;
}

/** Phone: same, with the app's storage key. */
export async function phoneAs(page: Page, request: APIRequestContext, personaId: string, path = '/home') {
  const session = await apiToken(request, personaId, 'app');
  await page.goto(`${PHONE_URL}/welcome`);
  await page.evaluate((s) => localStorage.setItem('tgs.app.session', JSON.stringify(s)), session);
  await page.goto(`${PHONE_URL}${path}`);
  return session;
}

/** Wait until a Member App screen has rendered and its loading skeletons are gone. */
export async function phoneSettled(page: Page) {
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="skeleton"]')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(300);
}

export async function phoneSignOut(page: Page) {
  await page.evaluate(() => localStorage.removeItem('tgs.app.session'));
}

/** A second browser context sized like a phone, for cross-app tests run from the console project. */
export async function phoneContext(browser: Browser, tracker?: ErrorTracker): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
  const page = await context.newPage();
  tracker?.watch(page, 'phone');
  return { context, page };
}

/** Press a react-native-web Pressable / button by its accessible name. */
export async function tap(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).first().click();
}

export const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
