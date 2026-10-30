// DEMO-SCRIPT.md rehearsed end to end (Acts 1–7) on one fresh reset, console + phone side by side.
// Each act is a test in a serial group; they share state like a real presentation.
//   npx playwright test demo-script --repeat-each=2     (must pass twice in a row)
import type { BrowserContext, Page } from '@playwright/test';
import { API, apiCall, apiToken, consoleAs, CONSOLE_URL, ErrorTracker, expect, OTP, PHONE_URL, phoneAs, resetDemo, setFailureRate, shot, tap, test } from './support';

test.describe.configure({ mode: 'serial' });

let phoneCtx: BrowserContext;
let phone: Page;
const phoneErrors = new ErrorTracker();

test.beforeAll(async ({ browser, request }) => {
  await resetDemo(request);
  phoneCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
  phone = await phoneCtx.newPage();
  phoneErrors.watch(phone, 'phone');
});
test.afterAll(async ({ request }) => {
  await setFailureRate(request, 0);
  await phoneCtx?.close();
  expect(phoneErrors.errors, 'phone errors during the demo').toEqual([]);
});

async function otp(page: Page) {
  await page.getByLabel('One-time password').last().click();
  await page.keyboard.type(OTP);
}

/** Press "Act as …" `n` times on the current console page, waiting for each step to land. */
async function actAs(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    const btn = page.getByRole('button', { name: /^Act as / }).first();
    await expect(btn).toBeEnabled();
    const label = await btn.innerText();
    await btn.click();
    // Landed when the next owner's button shows, or no "Act as" is left (pressed buttons go blank while loading).
    const last = i === n - 1;
    await expect
      .poll(
        async () => {
          const b = page.getByRole('button', { name: /^Act as / }).first();
          if (!(await b.count())) return last ? 'ok' : 'wait';
          // The page can re-render between calls; a vanished button just means "look again".
          const text = await b.innerText({ timeout: 1_000 }).catch(() => label);
          return text !== label && (await b.isEnabled().catch(() => false)) ? 'ok' : 'wait';
        },
        { timeout: 30_000 },
      )
      .toBe('ok');
  }
}

async function pick(page: Page, field: string, option: string | RegExp) {
  await page.getByRole('button', { name: new RegExp(`^${field}:`) }).click();
  await page.getByText(option).last().click();
}

test('Act 1 · the office at a glance (console)', async ({ page }) => {
  await page.goto(`${CONSOLE_URL}/login`);
  await page.getByRole('button', { name: /Suresh Goud/ }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search members, loans, deposits and receipts').fill('1104');
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByText(/Mahesh Babu P/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /demo controls/ })).toBeVisible();
  await shot(page, 'demo-act1');
});

test('Act 2 · joining the society (phone → console → phone)', async ({ page, request }) => {
  test.setTimeout(240_000);
  await phone.goto(`${PHONE_URL}/welcome`);
  await phone.evaluate(() => localStorage.removeItem('tgs.app.session'));
  await phone.goto(`${PHONE_URL}/welcome`);
  await tap(phone, /Become a member/);
  await tap(phone, /Continue as Divya S/);
  // Eligibility: Yes, Yes, No.
  const yes = phone.getByRole('radio', { name: 'Yes' }).or(phone.getByRole('button', { name: 'Yes' }));
  const no = phone.getByRole('radio', { name: 'No' }).or(phone.getByRole('button', { name: 'No' }));
  await yes.nth(0).click();
  await yes.nth(1).click();
  await no.nth(2).click();
  await tap(phone, 'Check eligibility');
  // Wizard: About you.
  await expect(phone.getByText('Membership application').first()).toBeVisible();
  await phone.getByLabel("Father's name").fill('Ramesh S');
  await phone.getByLabel('Date of birth').fill('15/06/1994');
  await phone.getByRole('radio', { name: 'Female' }).or(phone.getByRole('button', { name: 'Female' })).first().click();
  await tap(phone, 'Save & continue');
  // Address.
  await phone.getByLabel('Present address: House no. and street').fill('H.No 2-41, Ameerpet');
  await phone.getByLabel('Present address: City / town').fill('Hyderabad');
  await phone.getByLabel('Present address: PIN code').fill('500016');
  await phone.getByText('Permanent address is the same').click();
  await tap(phone, 'Save & continue');
  // Employment.
  await pick(phone, 'Department', 'Finance');
  await pick(phone, 'Designation', /Junior Assistant/);
  await phone.getByRole('radio', { name: /^Regular appointment/ }).click();
  await phone.getByLabel('Date of regular appointment').fill('01/07/2019');
  await tap(phone, 'Save & continue');
  // Shares & nominee.
  await phone.getByLabel("Nominee's full name").fill('Ramesh S');
  await pick(phone, 'Relationship', 'Father');
  await tap(phone, 'Save & continue');
  // Documents: upload every required one.
  for (let i = 0; i < 3; i++) {
    await phone.getByRole('button', { name: 'Upload' }).first().click();
    await phone.waitForTimeout(900);
  }
  await tap(phone, 'Save & continue');
  // Declarations.
  for (let i = 0; i < 3; i++) await phone.getByText('I agree').nth(i).click();
  await tap(phone, 'Save & continue');
  // Review → sign.
  await expect(phone.getByText('Everything looks complete')).toBeVisible();
  await tap(phone, 'Sign & submit');
  await otp(phone);
  await expect(phone.getByText(/Application received|Department verification/).first()).toBeVisible({ timeout: 20_000 });
  await shot(phone, 'demo-act2-tracker');

  // Console as Suresh: Joining → Divya → his own intake, then Act as for the other stages.
  await consoleAs(page, request, 'stf-accountant', '/joining');
  await page.getByText('Divya S').first().click();
  await expect(page.getByRole('heading', { name: /Divya S/ })).toBeVisible();
  const done = page.getByText(/Member · General No\./);
  const own = page.getByRole('button', { name: 'Send to DDO' }).or(page.getByRole('button', { name: /^Recommend/ }));
  const other = page.getByRole('button', { name: /^Act as / });
  for (let i = 0; i < 8; i++) {
    // Wait for the page to settle on one of: finished, Suresh's own step, or someone else's step.
    await expect(done.or(own).or(other).first()).toBeVisible();
    if (await done.count()) break;
    if (await own.count()) {
      await own.first().click();
      const d = page.getByRole('dialog');
      await d.locator('footer').getByRole('button').last().click(); // the drawer's primary action, e.g. "Send to Kiran Kumar"
      await expect(d).toBeHidden();
    } else await actAs(page, 1);
  }
  const generalNo = (await page.getByText(/Member · General No\. \d+/).first().innerText()).match(/\d+/)![0];
  await shot(page, 'demo-act2-console');

  await phone.reload();
  await expect(phone.getByText('Welcome to the society!')).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByText(generalNo).first()).toBeVisible();
});

test('Act 3 · a loan from application to money (phone ↔ console)', async ({ page, request }) => {
  test.setTimeout(240_000);
  await phoneAs(phone, request, 'mem-1102', '/account/calculators');
  await expect(phone.getByText(/retire/i).first()).toBeVisible();

  await phoneAs(phone, request, 'mem-1101', '/home');
  await phone.getByRole('button', { name: 'Apply loan' }).first().click();
  await phone.getByText(/^Education Loan/).first().click();
  await tap(phone, 'Continue');
  await tap(phone, 'Save & continue'); // pay details are pre-filled
  await phone.getByLabel('Amount you need').fill('150000');
  await phone.getByLabel('What is it for?').fill("Daughter's B.Tech fees");
  await phone.getByLabel("Student's name").fill('Kavya D');
  await phone.getByLabel('Relation to you').fill('Daughter');
  await phone.getByLabel('Institution').fill('JNTU Hyderabad');
  await phone.getByLabel('Course').fill('B.Tech');
  await expect(phone.getByText('You are eligible')).toBeVisible({ timeout: 20_000 });
  await tap(phone, 'Save & continue');
  for (const q of ['Sravani', '1104']) {
    await phone.getByLabel('Find a member').fill(q);
    await phone.getByRole('button', { name: q === '1104' ? /Mahesh Babu P/ : /Sravani M/ }).first().click();
  }
  await tap(phone, 'Save & continue');
  await tap(phone, 'Sign with OTP');
  await otp(phone);
  await tap(phone, 'Confirm & submit');
  // The new loan's page, not /loan/apply (which also matches /loan/<x> and would race the redirect).
  await phone.waitForURL((url) => /\/loan\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/apply'), { timeout: 20_000 });
  const lakshmi = (await apiToken(request, 'mem-1101', 'app')).token;
  const mine = await apiCall<Array<{ id: string; product: string; status: string }>>(request, 'GET', '/me/loans', lakshmi);
  const loanId = mine.find((l) => l.product === 'EDUCATION' && l.status === 'SURETY_PENDING')!.id;
  expect(phone.url()).toContain(loanId);

  for (const surety of ['mem-1103', 'mem-1104']) {
    await phoneAs(phone, request, surety, '/home');
    await phone.getByText(/asked you to be a surety|^\d+ surety requests?$/i).first().click();
    if (!phone.url().includes(loanId)) await phone.getByRole('button', { name: /Lakshmi Devi/ }).first().click();
    await tap(phone, 'Agree & sign with OTP');
    await otp(phone);
    await tap(phone, 'Confirm & sign');
    await expect(phone.getByText('Signed as surety')).toBeVisible();
  }

  await consoleAs(page, request, 'stf-admin', `/loans/${loanId}`);
  await actAs(page, 3);
  await expect(page.getByText('For office use · sanction sheet').first()).toBeVisible();
  await shot(page, 'demo-act3-assessed');
  await actAs(page, 3);
  await expect(page.getByText(/Disbursed on/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sanction letter' })).toBeVisible();

  await phoneAs(phone, request, 'mem-1101', `/loan/${loanId}`);
  await expect(phone.getByText('Monthly instalment')).toBeVisible();
  await shot(phone, 'demo-act3-phone');
});

test('Act 4 · fixed deposit (phone → console → phone)', async ({ page, request }) => {
  test.setTimeout(180_000);
  await phoneAs(phone, request, 'mem-1101', '/home');
  await phone.getByRole('button', { name: 'Open FD' }).first().click();
  await phone.getByRole('textbox', { name: 'Amount', exact: true }).fill('50000');
  await tap(phone, 'Continue');
  await tap(phone, 'Continue'); // payout: on maturity
  await tap(phone, 'Continue'); // only me
  await tap(phone, 'Continue'); // nominee pre-filled
  await phone.getByText('I have read the rules and request this deposit').click();
  await tap(phone, 'Sign with OTP');
  await otp(phone);
  await tap(phone, 'Confirm & submit');
  await phone.waitForURL(/\/deposit\/[^/]+$/, { timeout: 20_000 });
  await expect(phone.getByText('Waiting for payment').filter({ visible: true }).first()).toBeVisible();
  const fdId = phone.url().split('/deposit/')[1]!;

  await consoleAs(page, request, 'stf-cashier', '/deposits');
  await page.getByRole('tab', { name: /^FD requests/ }).click();
  await page.getByText('Lakshmi Devi').first().click();
  await page.waitForURL(`**/deposits/${fdId}`);
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Fill fewest notes' }).click();
  await d.getByRole('button', { name: 'Record payment' }).click();
  await expect(d).toBeHidden();
  await actAs(page, 2);
  await page.getByRole('button', { name: 'FDR' }).click();
  await expect(page.getByText('FIXED DEPOSIT RECEIPT')).toBeVisible();
  const fdr = (await page.getByText(/FDR No\. FDR-\d{4}-\d+/).innerText()).match(/FDR-\d{4}-\d+/)![0];

  await phoneAs(phone, request, 'mem-1101', `/deposit/${fdId}`);
  await expect(phone.getByText(fdr).first()).toBeVisible();
});

test('Act 5 · month end: demand and recovery (console → phone)', async ({ page, request }) => {
  test.setTimeout(240_000);
  await consoleAs(page, request, 'stf-accountant', '/demand-sheets');
  await page.getByRole('button', { name: 'Generate' }).first().click();
  await page.getByRole('button', { name: /^Generate \d+ sheets?/ }).click();
  await page.waitForURL(/\/demand-sheets(\?|$)/);
  await page.getByRole('link').filter({ hasText: /Generated/ }).first().click();
  await page.getByRole('button', { name: 'Certify' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Certify correct' }).click();
  await page.getByRole('button', { name: 'Send to DDO' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Enter recovery' }).click();
  await page.getByRole('button', { name: 'Import DDO statement' }).click();
  await page.getByRole('button', { name: 'Post recovery' }).click();
  await page.getByRole('button', { name: 'Yes, post' }).click();
  await expect(page.getByText(/recovery posted/)).toBeVisible();

  await phoneAs(phone, request, 'mem-1104', '/payments');
  await expect(phone.getByText(/short|Being deducted|unpaid/i).first()).toBeVisible();
  // From the Payments tab, like the presenter: Report a payment → date, UTR → back on Payments.
  await tap(phone, 'Report a payment');
  await expect(phone.getByText('Send for verification').filter({ visible: true })).toBeVisible();
  await phone.getByLabel('Paid on').fill('24/10/2026');
  await phone.getByLabel('UTR / transaction ID').fill('UTR5566778899');
  await tap(phone, 'Send for verification');
  await phone.waitForURL(/\/payments$/);
  const mahesh = (await apiToken(request, 'mem-1104', 'app')).token;
  const mine = await apiCall<{ reports: Array<{ reference: string; status: string }> }>(request, 'GET', '/me/payments', mahesh);
  expect(mine.reports.find((r) => r.reference === 'UTR5566778899')?.status).toBe('REPORTED');

  await consoleAs(page, request, 'stf-cashier', '/payments');
  await page.getByRole('tab', { name: /Reported by members/ }).click();
  await page.getByRole('listitem').filter({ hasText: 'UTR5566778899' }).getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('dialog').getByText("I found this credit in the society's bank statement").click();
  await page.getByRole('dialog').getByRole('button', { name: 'Verify & create receipt' }).click();
  await page.waitForURL(/\/payments\/[^/]+$/);

  await phoneAs(phone, request, 'mem-1104', '/payment/report');
  await expect(phone.getByText('Nothing unpaid').first()).toBeVisible();
});

test('Act 6 · reports, notices and messages (console → phone)', async ({ page, request }) => {
  test.setTimeout(180_000);
  await consoleAs(page, request, 'stf-accountant', '/reports');
  await page.getByText('Defaulters list').first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.goto(`${CONSOLE_URL}/reports`);
  await page.getByText('Defaulter notice').first().click();
  await expect(page.getByRole('heading').first()).toBeVisible();
  for (const r of ['Department-wise less collections', 'Retirement report', 'Member-wise ledger']) {
    await page.goto(`${CONSOLE_URL}/reports`);
    await page.getByText(r).first().click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  await page.goto(`${CONSOLE_URL}/notifications`);
  await page.getByRole('button', { name: 'Send a message' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('radio', { name: /All defaulters/ }).click();
  await d.getByRole('radio', { name: /Dues reminder/i }).click();
  await d.getByRole('button', { name: 'Preview' }).click();
  await d.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Delivered (simulated)').first()).toBeVisible();

  await page.goto(`${CONSOLE_URL}/notifications?tab=questions`);
  await page.getByText('FD receipt not received').first().click();
  await page.getByLabel('Reply').fill('It is ready at the counter.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await phoneAs(phone, request, 'mem-1101', '/account/notifications');
  await expect(phone.getByText('Reply from the society office').first()).toBeVisible();
});

test('Act 7 · settings and the member account', async ({ page, request }) => {
  test.setTimeout(180_000);
  await consoleAs(page, request, 'stf-admin', '/settings/loan-products');
  const setOrdinaryRate = async (rate: string) => {
    await page.getByRole('button', { name: 'Edit' }).first().click(); // Ordinary is the first product
    const d = page.getByRole('dialog');
    await d.getByLabel('Interest rate').fill(rate);
    await d.getByRole('button', { name: 'Save product' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText(`${rate}%`).first()).toBeVisible();
  };
  await setOrdinaryRate('13');
  await phoneAs(phone, request, 'mem-1101', '/rates');
  await expect(phone.getByText('13%').first()).toBeVisible();
  await setOrdinaryRate('11');

  // A member who never used the app signs in with the registered mobile and a one-time code (D-067).
  const sample = (await (await request.get(`${API}/__demo/activation-sample`)).json()) as { mobile: string };
  await phone.evaluate(() => localStorage.removeItem('tgs.app.session'));
  await phone.goto(`${PHONE_URL}/login`);
  await phone.getByLabel('Mobile number').fill(sample.mobile);
  await tap(phone, 'Send code');
  await otp(phone);
  await expect(phone.getByText(/^Hello, /)).toBeVisible();
});
