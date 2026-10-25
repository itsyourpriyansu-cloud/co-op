// AC-X01 cross-app hand-offs: what one app does, the other shows. Console on the left (this page),
// phone in a second phone-sized context. Setup that is not the hand-off itself uses the API.
import type { APIRequestContext, Page } from '@playwright/test';
import { formatINR } from '@tgs/domain';
import { apiCall, apiToken, consoleAs, CONSOLE_URL, expect, OTP, PHONE_URL, phoneAs, phoneContext, resetDemo, shot, tap, test } from './support';

/**
 * After pressing "Act as <owner>": wait until the flow is done, or the next stage's (enabled) "Act as"
 * button shows. A pressed button briefly loses its text while loading, so "label gone" is not enough.
 */
async function stepLanded(page: Page, label: string, done: () => Promise<boolean>) {
  await expect
    .poll(
      async () => {
        if (await done()) return 'done';
        const b = page.getByRole('button', { name: /^Act as / }).first();
        if (!(await b.count())) return 'wait';
        return (await b.innerText()) !== label && (await b.isEnabled()) ? 'next' : 'wait';
      },
      { timeout: 30_000 },
    )
    .toMatch(/done|next/);
}

/** Press "Act as …" until `done` is true (each press completes one stage as its owner). */
async function actUntil(page: Page, done: () => Promise<boolean>, max = 10) {
  for (let i = 0; i < max && !(await done()); i++) {
    const btn = page.getByRole('button', { name: /^Act as / }).first();
    await expect(btn).toBeEnabled();
    const label = await btn.innerText();
    await btn.click();
    await stepLanded(page, label, done);
  }
  expect(await done()).toBe(true);
}

async function divyaApplies(request: APIRequestContext) {
  const admin = (await apiToken(request, 'stf-admin', 'console')).token;
  const list = await apiCall<{ rows: Array<{ id: string; status: string }> }>(request, 'GET', '/membership/applications', admin);
  const sample = await apiCall<{ application: { form: Record<string, unknown> } }>(request, 'GET', `/membership/applications/${list.rows.find((r) => r.status === 'ACTIVE')!.id}`, admin);
  const divya = await apiToken(request, 'apl-divya', 'app');
  await apiCall(request, 'POST', '/membership/me/eligibility', divya.token, { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false });
  const form = { ...sample.application.form, personal: { ...(sample.application.form.personal as object), fullName: 'Divya S' } };
  await apiCall(request, 'PUT', '/membership/me/draft', divya.token, form);
  const sign = await apiCall<{ otpRef: string }>(request, 'POST', '/membership/me/sign/request', divya.token);
  await apiCall(request, 'POST', '/membership/me/submit', divya.token, { otpRef: sign.otpRef, otp: OTP });
  return divya;
}

test.describe('cross-app (AC-X01)', () => {
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('join: Divya applies → staff act on the console → her phone gets a General No.', async ({ page, browser, request, errors }) => {
    const divya = await divyaApplies(request);
    const phone = await phoneContext(browser, errors);
    await phone.page.goto(`${PHONE_URL}/welcome`);
    await phone.page.evaluate((s) => localStorage.setItem('tgs.app.session', JSON.stringify(s)), divya);
    await phone.page.goto(`${PHONE_URL}/tracker`);
    await expect(phone.page.getByText(/Your application|Application received/).first()).toBeVisible();

    const admin = (await apiToken(request, 'stf-admin', 'console')).token;
    const app = (await apiCall<{ rows: Array<{ id: string; name: string }> }>(request, 'GET', '/membership/applications', admin)).rows.find((r) => r.name === 'Divya S')!;
    await consoleAs(page, request, 'stf-admin', `/joining/${app.id}`);
    await actUntil(page, async () => (await page.getByText(/Member · General No\./).count()) > 0);
    const generalNo = (await page.getByText(/Member · General No\. \d+/).first().innerText()).match(/\d+/)![0];
    await shot(page, 'x-join-console');

    await phone.page.reload();
    await expect(phone.page.getByText('Welcome to the society!')).toBeVisible({ timeout: 20_000 });
    await expect(phone.page.getByText(generalNo).first()).toBeVisible();
    await shot(phone.page, 'x-join-phone');
    await phone.context.close();
  });

  test('loan: Sravani applies → Lakshmi and Mahesh sign on their phones → console to disbursement → Active on her phone', async ({ page, browser, request, errors }) => {
    const sravani = (await apiToken(request, 'mem-1103', 'app')).token;
    const pay = { scaleOfPay: '24280-72850', grossSalary: 5_200_000, govtLoanDeductions: 300_000, otherLoanDeductions: 0 };
    const d = await apiCall<{ loan: { id: string } }>(request, 'POST', '/me/loans', sravani, { product: 'EDUCATION', amount: 15_000_000, instalments: 36, purpose: 'B.Tech fees', sureties: ['mem-1101', 'mem-1104'], form: { pay, education: { studentName: 'Kavya M', relation: 'Daughter', institution: 'JNTU Hyderabad', course: 'B.Tech' } } });
    const id = d.loan.id;
    const sign = await apiCall<{ otpRef: string }>(request, 'POST', `/me/loans/${id}/sign/request`, sravani);
    await apiCall(request, 'POST', `/me/loans/${id}/submit`, sravani, { otpRef: sign.otpRef, otp: OTP });

    const phone = await phoneContext(browser, errors);
    for (const surety of ['mem-1101', 'mem-1104']) {
      await phoneAs(phone.page, request, surety, `/surety/${id}`);
      await tap(phone.page, 'Agree & sign with OTP');
      await phone.page.getByLabel('One-time password').click();
      await phone.page.keyboard.type(OTP);
      await tap(phone.page, 'Confirm & sign');
      await expect(phone.page.getByText('Signed as surety')).toBeVisible();
    }

    await consoleAs(page, request, 'stf-admin', `/loans/${id}`);
    await actUntil(page, async () => (await page.getByText(/Disbursed on/).count()) > 0);
    await shot(page, 'x-loan-console');

    await phoneAs(phone.page, request, 'mem-1103', `/loan/${id}`);
    await expect(phone.page.getByText(/Active|Running/).first()).toBeVisible();
    await expect(phone.page.getByText('Monthly instalment')).toBeVisible();
    await shot(phone.page, 'x-loan-phone');
    await phone.context.close();
  });

  test('FD: Lakshmi requests on the phone → cashier counts cash → Secretary → President → FDR on her phone', async ({ page, browser, request, errors }) => {
    const lakshmi = (await apiToken(request, 'mem-1101', 'app')).token;
    const o = await apiCall<{ otpRef: string }>(request, 'POST', '/me/deposits/sign/request', lakshmi, { principal: 5_000_000, tenureMonths: 24, payoutFrequency: 'ON_MATURITY', holding: 'SINGLE', nominee: { name: 'Mahesh Goud', relation: 'Spouse' } });
    const fd = await apiCall<{ deposit: { id: string } }>(request, 'POST', '/me/deposits', lakshmi, { otpRef: o.otpRef, otp: OTP });
    const id = fd.deposit.id;

    await consoleAs(page, request, 'stf-cashier', `/deposits/${id}`);
    await page.getByRole('button', { name: 'Record payment' }).first().click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Fill fewest notes' }).click();
    await drawer.getByRole('button', { name: 'Record payment' }).click();
    await expect(drawer).toBeHidden();
    await actUntil(page, async () => (await page.getByRole('button', { name: 'FDR' }).count()) > 0);
    const fdrNo = (await page.getByText(/FDR-\d{4}-\d+/).first().innerText()).match(/FDR-\d{4}-\d+/)![0];

    const phone = await phoneContext(browser, errors);
    await phoneAs(phone.page, request, 'mem-1101', `/deposit/${id}`);
    await expect(phone.page.getByText(fdrNo).first()).toBeVisible();
    await shot(phone.page, 'x-fd-phone');
    await phone.context.close();
  });

  test("Mahesh's short month reads the same on both apps", async ({ page, browser, request, errors }) => {
    const acc = (await apiToken(request, 'stf-accountant', 'console')).token;
    const m = await apiCall<{ ledger: Array<{ cycle: string; demand: number; recovered?: number }> }>(request, 'GET', '/members/mem-1104', acc);
    const short = m.ledger.find((r) => r.recovered !== undefined && r.recovered < r.demand)!;
    expect(short, 'Mahesh has a short month in the seed').toBeTruthy();

    await consoleAs(page, request, 'stf-accountant', '/members/mem-1104');
    await page.getByRole('tab', { name: 'Ledger' }).click();
    await expect(page.getByText(formatINR(short.recovered!)).first()).toBeVisible();

    const phone = await phoneContext(browser, errors);
    await phoneAs(phone.page, request, 'mem-1104', '/payments');
    await expect(phone.page.getByText(formatINR(short.recovered!)).first()).toBeVisible();
    await expect(phone.page.getByText(formatINR(short.demand)).first()).toBeVisible();
    await shot(phone.page, 'x-short-month-phone');
    await phone.context.close();
  });

  test('messages: a console message and a reply to a question reach the phone', async ({ page, browser, request, errors }) => {
    await consoleAs(page, request, 'stf-accountant', '/notifications');
    await page.getByRole('button', { name: 'Send a message' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('radio', { name: /One member/ }).click();
    await d.getByPlaceholder('Search by name or General No.').fill('1101');
    await d.getByRole('button', { name: /Lakshmi Devi/ }).first().click();
    await d.getByLabel('Message').fill('Dear {name}, your FD receipt is ready at the counter.');
    await d.getByRole('button', { name: 'Preview' }).click();
    await d.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Delivered (simulated)').first()).toBeVisible();

    await page.goto(`${CONSOLE_URL}/notifications?tab=questions`);
    await page.getByText('FD receipt not received').first().click();
    await page.getByLabel('Reply').fill('Collect it from the counter tomorrow.');
    await page.getByRole('button', { name: 'Send reply' }).click();

    const phone = await phoneContext(browser, errors);
    await phoneAs(phone.page, request, 'mem-1101', '/account/notifications');
    await expect(phone.page.getByText(/your FD receipt is ready at the counter/).first()).toBeVisible();
    await expect(phone.page.getByText('Reply from the society office').first()).toBeVisible();
    await shot(phone.page, 'x-messages-phone');
    await phone.context.close();
  });
});
