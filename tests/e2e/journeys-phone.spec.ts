// Member App journeys (J-14 and the member screens) on the Expo web build at phone size.
import type { Page } from '@playwright/test';
import { createSeed } from '@tgs/mock-data';
import { API, expect, OTP, PHONE_URL, phoneAs, resetDemo, shot, tap, test } from './support';

const MAHESH_MOBILE = createSeed().members.find((m) => m.generalNo === '1104')!.mobile;

async function typeOtp(page: Page) {
  await page.getByLabel('One-time password').click();
  await page.keyboard.type(OTP);
}

test.describe('member app journeys', () => {
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('J-14 sign in with a demo member, then sign out', async ({ page }) => {
    await page.goto(`${PHONE_URL}/welcome`);
    await tap(page, /I'm already a member/);
    await expect(page.getByText('Demo members')).toBeVisible();
    await tap(page, /Lakshmi Devi · 1101/);
    await expect(page.getByText('Hello, Lakshmi')).toBeVisible();
    await shot(page, 'phone-home-lakshmi');
    await page.goto(`${PHONE_URL}/more`);
    await tap(page, 'Sign out');
    await expect(page.getByText(/Become a member/).first()).toBeVisible();
  });

  test('J-14 sign in with the registered mobile and a one-time code (D-067)', async ({ page, request }) => {
    // A member who has never used the app: no activation step any more.
    const sample = (await (await request.get(`${API}/__demo/activation-sample`)).json()) as { mobile: string; name: string };
    await page.goto(`${PHONE_URL}/login`);
    await page.getByLabel('Mobile number').fill(sample.mobile);
    await tap(page, 'Send code');
    await expect(page.getByText(`Demo code: ${OTP}`)).toBeVisible();
    await typeOtp(page);
    await expect(page.getByText(`Hello, ${sample.name.split(' ')[0]}`)).toBeVisible();
    await shot(page, 'phone-otp-signed-in');
  });

  test('J-14 an unregistered mobile is told to become a member', async ({ page }) => {
    await page.goto(`${PHONE_URL}/login`);
    await page.getByLabel('Mobile number').fill('9999999990');
    await tap(page, 'Send code');
    await expect(page.getByText('Mobile not registered')).toBeVisible();
    await tap(page, 'Become a member');
    await expect(page.getByLabel('Full name')).toBeVisible();
  });

  test('J-14 a wrong code is refused, the right one signs in', async ({ page }) => {
    await page.goto(`${PHONE_URL}/login`);
    await page.getByLabel('Mobile number').fill(MAHESH_MOBILE);
    await tap(page, 'Send code');
    await page.getByLabel('One-time password').click();
    await page.keyboard.type('000000');
    await expect(page.getByText(/doesn't match|Incorrect code/).first()).toBeVisible();
    await typeOtp(page);
    await expect(page.getByText('Hello, Mahesh')).toBeVisible();
  });

  test('home snapshot, loans, deposits and payments tabs', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1101');
    await expect(page.getByText('Hello, Lakshmi')).toBeVisible();
    await expect(page.getByText('My loans')).toBeVisible();
    for (const [path, text] of [
      ['/loans', /Loans/],
      ['/deposits', /Deposits|Fixed deposit/],
      ['/payments', /Payments/],
    ] as const) {
      await page.goto(`${PHONE_URL}${path}`);
      await expect(page.getByText(text).first()).toBeVisible();
      await expect(page.getByText(/Couldn't load/)).toHaveCount(0);
      await shot(page, `phone${path.replace('/', '-')}`);
    }
  });

  test('Mahesh reports a payment for his short month', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1104', '/payments');
    await tap(page, 'Report a payment');
    await expect(page.getByText('Send for verification').filter({ visible: true })).toBeVisible();
    await page.getByLabel('Paid on').fill('24/10/2026');
    await page.getByLabel('UTR / transaction ID').fill('UTR4455667788');
    await tap(page, 'Send for verification');
    await page.waitForURL(/\/payments$/);
    await page.getByText(/^Reported \d+$/).filter({ visible: true }).click();
    await expect(page.getByText('UTR4455667788').filter({ visible: true }).first()).toBeVisible();
    await shot(page, 'phone-payment-reported');
  });

  test('calculators cap the months for Ramaiah (BR-002)', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1102', '/account/calculators');
    await expect(page.getByText('Calculators').first()).toBeVisible();
    await expect(page.getByText(/13 months|retire/i).first()).toBeVisible();
    await shot(page, 'phone-calculators');
  });

  test('help: ask the office a question', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1103', '/account/help');
    await tap(page, /Ask (the office a|another) question/);
    await page.getByLabel('Subject').fill('Interest certificate');
    await page.getByLabel('Your question').fill('Please send my interest certificate for this year.');
    await tap(page, 'Send question');
    await expect(page.getByText('Interest certificate').first()).toBeVisible();
  });

  test('settings and notifications open', async ({ page, request }) => {
    await phoneAs(page, request, 'mem-1101', '/account/settings');
    await expect(page.getByText('Where we reach you')).toBeVisible();
    await page.goto(`${PHONE_URL}/account/notifications`);
    await expect(page.getByText('Notifications').first()).toBeVisible();
    await expect(page.getByText("Couldn't load notifications")).toHaveCount(0);
  });
});
