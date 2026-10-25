// Staff journeys J-03 … J-13 (docs/04, docs/15) driven through the console UI. Each test starts from
// a reset; setup that is not the subject of the test (a member applying on the phone, sureties
// signing) is done through the API.
import type { APIRequestContext, Page } from '@playwright/test';
import { apiCall, apiToken, consoleAs, CONSOLE_URL, expect, OTP, resetDemo, shot, test } from './support';

/** Sravani applies for an Ordinary loan with Lakshmi and Mahesh as sureties; both sign → ACCOUNTANT_REVIEW. */
async function loanAtReview(request: APIRequestContext): Promise<string> {
  const s = (await apiToken(request, 'mem-1103', 'app')).token;
  const pay = { scaleOfPay: '31040-92050', grossSalary: 6_500_000, govtLoanDeductions: 200_000, otherLoanDeductions: 0 };
  const d = await apiCall<{ loan: { id: string } }>(request, 'POST', '/me/loans', s, { product: 'ORDINARY', amount: 20_000_000, instalments: 48, purpose: 'House construction', sureties: ['mem-1104', 'mem-1101'], form: { pay } });
  const id = d.loan.id;
  const sign = await apiCall<{ otpRef: string }>(request, 'POST', `/me/loans/${id}/sign/request`, s);
  await apiCall(request, 'POST', `/me/loans/${id}/submit`, s, { otpRef: sign.otpRef, otp: OTP });
  for (const p of ['mem-1104', 'mem-1101']) {
    const t = (await apiToken(request, p, 'app')).token;
    const o = await apiCall<{ otpRef: string }>(request, 'POST', `/me/surety-requests/${id}/sign/request`, t);
    await apiCall(request, 'POST', `/me/surety-requests/${id}/accept`, t, { otpRef: o.otpRef, otp: OTP });
  }
  return id;
}

/** Open a drawer by its trigger button and press its confirm button (same label). */
async function drawerAction(page: Page, trigger: string | RegExp, fill?: (drawer: ReturnType<Page['getByRole']>) => Promise<void>, confirm?: string | RegExp) {
  await page.getByRole('button', { name: trigger }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  if (fill) await fill(drawer);
  await drawer.getByRole('button', { name: confirm ?? trigger }).last().click();
  await expect(drawer).toBeHidden();
}

test.describe('staff journeys', () => {
  test.beforeEach(async ({ request }) => resetDemo(request));

  test('J-03…J-08 loan: Work Queue → review → DDO → assessment → 2-step sanction → disbursement → letter', async ({ page, request }) => {
    const id = await loanAtReview(request);
    await consoleAs(page, request, 'stf-accountant', '/queue');
    await expect(page.getByRole('heading', { name: 'Work Queue' })).toBeVisible();
    await page.getByRole('tab', { name: /^Review/ }).click();
    await page.getByText('Sravani M').first().click();
    await page.waitForURL(`**/loans/${id}`);

    await drawerAction(page, 'Forward to DDO', async (d) => {
      await d.getByText('Member details match the member master').click();
      await d.getByText('Application and documents verified').click();
    });
    // Now with the Finance DDO (the Accountant only sees the paper-certificate fallback).
    await expect(page.getByText('DDO certification').first()).toBeVisible();

    // The Finance DDO certifies items 1–5.
    await consoleAs(page, request, 'stf-ddo-fin', `/loans/${id}`);
    await drawerAction(page, 'Certify items 1–5', async (d) => {
      await d.getByText(/Particulars are correct/).click();
    });

    await consoleAs(page, request, 'stf-accountant', `/loans/${id}`);
    await drawerAction(page, 'Send for sanction', async (d) => {
      await expect(d.getByText('Net disbursable')).toBeVisible();
    });
    await shot(page, 'j05-assessed');

    await consoleAs(page, request, 'stf-secretary', `/loans/${id}`);
    await drawerAction(page, 'Sign sanction (1 of 2)');
    await consoleAs(page, request, 'stf-president', `/loans/${id}`);
    await drawerAction(page, 'Sign sanction (2 of 2)');
    await expect(page.getByRole('button', { name: 'Sanction letter' })).toBeVisible();

    await consoleAs(page, request, 'stf-cashier', `/loans/${id}`);
    await drawerAction(page, 'Disburse', async (d) => {
      await d.getByLabel(/UTR \/ reference/).fill('UTR778812345');
    });
    await expect(page.getByText(/Disbursed on/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sanction letter' }).click();
    await expect(page.getByText(/Sub: Sanction of Ordinary Loan/)).toBeVisible();
    await shot(page, 'j08-sanction-letter');
  });

  test('J-12 FD at the counter: cash with denominations → Secretary → President → FDR', async ({ page, request }) => {
    const { token } = await apiToken(request, 'stf-cashier', 'console');
    const reqs = await apiCall<{ items: Array<{ id: string; status: string }> }>(request, 'GET', '/deposits?tab=REQUESTS&status=REQUESTED', token);
    const id = reqs.items[0]!.id;
    await consoleAs(page, request, 'stf-cashier', `/deposits/${id}`);
    await page.getByRole('button', { name: 'Record payment' }).first().click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Fill fewest notes' }).click();
    await expect(d.getByText(/Notes match the amount/)).toBeVisible();
    await d.getByRole('button', { name: 'Record payment' }).click();
    await expect(d).toBeHidden();

    await consoleAs(page, request, 'stf-secretary', `/deposits/${id}`);
    await drawerAction(page, 'Accept');
    await consoleAs(page, request, 'stf-president', `/deposits/${id}`);
    await drawerAction(page, 'Accept');
    await page.getByRole('button', { name: 'FDR' }).click();
    await expect(page.getByText('FIXED DEPOSIT RECEIPT')).toBeVisible();
    await shot(page, 'j12-fdr');
  });

  test('J-10 month end: generate → certify → send → import statement → post', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/demand-sheets/generate');
    await page.getByRole('button', { name: /^Generate \d+ sheets?/ }).click();
    await page.waitForURL(/\/demand-sheets(\?|$)/);
    const { token } = await apiToken(request, 'stf-accountant', 'console');
    const list = await apiCall<{ rows: Array<{ id: string; status: string }> }>(request, 'GET', '/demand?cycle=2026-10', token);
    const sheet = list.rows.find((r) => r.status === 'GENERATED')!;
    await page.goto(`${CONSOLE_URL}/demand-sheets/${sheet.id}`);
    await drawerAction(page, 'Certify', undefined, 'Certify correct');
    await drawerAction(page, 'Send to DDO', undefined, 'Send');
    await page.getByRole('button', { name: 'Enter recovery' }).click();
    await page.getByRole('button', { name: 'Import DDO statement' }).click();
    await expect(page.getByText(/came short/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Post recovery' }).click();
    await page.getByRole('button', { name: 'Yes, post' }).click();
    await page.waitForURL(`**/demand-sheets/${sheet.id}`);
    await expect(page.getByText(/recovery posted/)).toBeVisible();
    await shot(page, 'j10-posted');
  });

  test('J-11 counter receipt and verifying a member-reported payment', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-cashier', '/payments');
    await page.getByRole('tab', { name: /Reported by members/ }).click();
    await page.getByRole('button', { name: 'Verify' }).first().click();
    const d = page.getByRole('dialog');
    await d.getByText("I found this credit in the society's bank statement").click();
    await d.getByRole('button', { name: 'Verify & create receipt' }).click();
    await page.waitForURL(/\/payments\/[^/]+$/);
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();

    await page.goto(`${CONSOLE_URL}/payments/new`);
    await page.getByPlaceholder('Search by name or General No.').fill('1104');
    await page.getByRole('button', { name: /Mahesh Babu P/ }).first().click();
    await page.getByRole('radio', { name: /Bank transfer/ }).click();
    const amount = page.getByLabel('Amount');
    await amount.fill('500');
    await page.getByLabel('UTR / reference').fill('UTR123987');
    await page.getByRole('button', { name: /Save receipt/ }).click();
    await page.waitForURL(/\/payments\/[^/]+$/);
    await expect(page.getByText(/Mahesh Babu P/).first()).toBeVisible();
    await shot(page, 'j11-receipt');
  });

  test('J-13 reports: defaulters list, CSV download, defaulter notice', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/reports');
    await page.getByText('Defaulters list').first().click();
    await expect(page.getByRole('heading', { name: 'Defaulters list' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await page.goto(`${CONSOLE_URL}/reports`);
    await page.getByText('Defaulter notice').first().click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await shot(page, 'j13-defaulter-notice');
  });

  test('messages: composer sends to defaulters; member question gets a reply', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant', '/notifications');
    await page.getByRole('button', { name: 'Send a message' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('radio', { name: /All defaulters/ }).click();
    await d.getByRole('radio', { name: /Dues reminder/i }).click();
    await expect(d.getByLabel('Message')).not.toHaveValue('');
    await d.getByRole('button', { name: 'Preview' }).click();
    await d.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Delivered (simulated)').first()).toBeVisible();

    await page.goto(`${CONSOLE_URL}/notifications?tab=questions`);
    await page.getByText('FD receipt not received').first().click();
    await page.getByLabel('Reply').fill('Your FDR is ready at the counter.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Your FDR is ready at the counter.').first()).toBeVisible();
  });

  test('global search finds a member by General No. (Ctrl K)', async ({ page, request }) => {
    await consoleAs(page, request, 'stf-accountant');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').or(page.getByLabel('Search members, loans, deposits and receipts')).first().fill('1104');
    const results = page.getByRole('listbox', { name: 'Search results' });
    await expect(results.getByText(/Mahesh Babu P/).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/members\//);
  });
});
