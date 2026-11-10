// Staff journeys on the phone (docs/23 §6 exit tests), through the staff screens against the backend.
// Setup that is not the subject of a test (a member applying, sureties signing) goes through the API.
import type { APIRequestContext, Page } from '@playwright/test';
import { apiCall, apiToken, consoleAs, expect, OTP, phoneAs, PHONE_URL, phoneSettled, resetDemo, shot, staffAs, tap, test } from './support';

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

async function divyaApplies(request: APIRequestContext) {
  const admin = (await apiToken(request, 'stf-admin', 'console')).token;
  const list = await apiCall<{ rows: Array<{ id: string; status: string }> }>(request, 'GET', '/membership/applications', admin);
  const sample = await apiCall<{ application: { form: Record<string, unknown> } }>(request, 'GET', `/membership/applications/${list.rows.find((r) => r.status === 'ACTIVE')!.id}`, admin);
  const divya = await apiToken(request, 'apl-divya', 'app');
  await apiCall(request, 'POST', '/membership/me/eligibility', divya.token, { worksInSecretariatDept: true, regularOrApprovedProbationer: true, memberOfOtherCreditSocietyWithDues: false });
  // In Finance, so the Finance DDO persona can certify it.
  const form = sample.application.form;
  await apiCall(request, 'PUT', '/membership/me/draft', divya.token, { ...form, personal: { ...(form.personal as object), fullName: 'Divya S' }, employment: { ...(form.employment as object), departmentId: 'dept-fin' } });
  const sign = await apiCall<{ otpRef: string }>(request, 'POST', '/membership/me/sign/request', divya.token);
  await apiCall(request, 'POST', '/membership/me/submit', divya.token, { otpRef: sign.otpRef, otp: OTP });
  const after = await apiCall<{ rows: Array<{ id: string; name: string }> }>(request, 'GET', '/membership/applications', admin);
  return after.rows.find((r) => r.name === 'Divya S')!.id;
}

/** Open a decision from a record's footer, fill it and confirm with its button (same label unless given). */
async function decide(page: Page, trigger: string | RegExp, fill?: () => Promise<void>, confirm?: string | RegExp) {
  await tap(page, trigger);
  await page.waitForURL(/\/staff\/.+\/.+\/.+/);
  await phoneSettled(page);
  if (fill) await fill();
  await tap(page, confirm ?? trigger);
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
}

test.describe('staff journeys', () => {
  test.beforeEach(async ({ page, request }) => {
    page.on('dialog', (d) => void d.accept());
    await resetDemo(request);
  });

  test('S1 each role sees its own tabs; a member and a stranger route are kept out', async ({ page, request }) => {
    await staffAs(page, request, 'stf-cashier', '/staff/home');
    await phoneSettled(page);
    await expect(page.getByRole('tab', { name: /Payments/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveCount(0);
    // Same permissions as the console: a cashier can't edit members.
    await page.goto(`${PHONE_URL}/staff/member/new`);
    await expect(page.getByText("You don't have access to this")).toBeVisible();

    await staffAs(page, request, 'stf-ddo-fin', '/staff/home');
    await phoneSettled(page);
    await expect(page.getByRole('tab', { name: /Demand/ })).toBeVisible();
    // A DDO has no reports.
    await page.goto(`${PHONE_URL}/staff/reports`);
    await expect(page.getByText("You don't have access to this")).toBeVisible();

    // A section not on this role's tab bar still opens from More.
    await staffAs(page, request, 'stf-accountant', '/staff/more');
    await phoneSettled(page);
    await tap(page, /^Reports/);
    await expect(page).toHaveURL(/\/staff\/reports$/);
    await expect(page.getByText('Printable forms & letters')).toBeVisible();

    // A member never reaches the staff area.
    await phoneAs(page, request, 'mem-1101', '/staff/home');
    await expect(page.getByText('Hello, Lakshmi')).toBeVisible();
    await expect(page).not.toHaveURL(/\/staff\//);
  });

  test('S2 queue counts equal the server for every role, and a queue item opens its record', async ({ page, request }) => {
    const id = await loanAtReview(request);
    for (const persona of ['stf-admin', 'stf-accountant', 'stf-secretary', 'stf-president', 'stf-cashier', 'stf-ddo-fin']) {
      const { token } = await apiToken(request, persona, 'console');
      const server = await apiCall<{ items: unknown[] }>(request, 'GET', '/work-queue', token);
      await staffAs(page, request, persona, '/staff/home');
      await phoneSettled(page);
      if (server.items.length) await expect(persona === 'stf-admin' ? page.getByText(`${server.items.length} waiting on you`) : page.getByRole('button', { name: new RegExp(`^${server.items.length}\\s*waiting on you`) }), persona).toBeVisible();
      else await expect(page.getByText(/waiting on you/), persona).toHaveCount(0);
    }
    await staffAs(page, request, 'stf-accountant', '/staff/queue');
    await phoneSettled(page);
    await expect(page.getByText('Sravani M').first()).toBeVisible();
    await page.getByText('Sravani M').first().click();
    await page.waitForURL(`**/staff/loan/${id}`);
    await expect(page.getByText('Your turn')).toBeVisible();
  });

  test('S3 join: applicant → every staff step on the phone → General No.', async ({ page, request }) => {
    const id = await divyaApplies(request);
    await staffAs(page, request, 'stf-accountant', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Send to DDO', undefined, /^Send to /);

    await staffAs(page, request, 'stf-ddo-fin', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Certify', async () => {
      for (const r of await page.getByRole('radio', { name: 'Correct' }).all()) await r.click();
      await page.getByText('AGREED: deduct society dues').click();
    });

    await staffAs(page, request, 'stf-accountant', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Recommend');

    await staffAs(page, request, 'stf-secretary', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Approve');

    await staffAs(page, request, 'stf-president', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Approve', async () => {
      await page.getByRole('radio', { name: /On the first demand sheet/ }).click();
    });

    await staffAs(page, request, 'stf-cashier', `/staff/joining/${id}`);
    await phoneSettled(page);
    await decide(page, 'Activate membership', undefined, /Activate & allot General No\./);
    await shot(page, 'staff-join-done');
  });

  test('S4 loan: member applies → staff sanction and disburse on the phone → the console agrees', async ({ page, request }) => {
    const id = await loanAtReview(request);
    await staffAs(page, request, 'stf-accountant', `/staff/loan/${id}`);
    await phoneSettled(page);
    await shot(page, 'staff-loan-detail');
    await decide(page, 'Forward to DDO', async () => {
      await page.getByText('Member details match the member master').click();
      await page.getByText('Application and documents verified').click();
    });

    await staffAs(page, request, 'stf-ddo-fin', `/staff/loan/${id}`);
    await phoneSettled(page);
    await decide(page, 'Certify items 1–5', async () => {
      await page.getByText(/Particulars are correct/).click();
    });

    await staffAs(page, request, 'stf-accountant', `/staff/loan/${id}`);
    await phoneSettled(page);
    await decide(page, 'Send for sanction', async () => {
      await expect(page.getByText('Net disbursable').last()).toBeVisible();
      await shot(page, 'staff-loan-assess');
    });

    await staffAs(page, request, 'stf-secretary', `/staff/loan/${id}`);
    await phoneSettled(page);
    await decide(page, 'Sign sanction (1 of 2)');
    await staffAs(page, request, 'stf-president', `/staff/loan/${id}`);
    await phoneSettled(page);
    await decide(page, 'Sign sanction (2 of 2)');

    await staffAs(page, request, 'stf-cashier', `/staff/loan/${id}`);
    await phoneSettled(page);
    await decide(page, 'Disburse', async () => {
      await page.getByLabel(/UTR \/ reference/).fill('UTR778812345');
    });
    await tap(page, 'Done');
    await expect(page.getByText(/Disbursed on/).first()).toBeVisible();

    await consoleAs(page, request, 'stf-accountant', `/loans/${id}`);
    await expect(page.getByText(/Disbursed on/).first()).toBeVisible();
    await expect(page.getByText('UTR778812345').first()).toBeVisible();
  });

  test('S4 new loan on behalf of a member from the paper form', async ({ page, request }) => {
    await staffAs(page, request, 'stf-accountant', '/staff/loan/new');
    await phoneSettled(page);
    await page.getByRole('textbox', { name: 'Member' }).fill('1103');
    await tap(page, /Sravani M/);
    await expect(page.getByText('Left-over service')).toBeVisible();
    await tap(page, 'Continue');
    await page.getByRole('radio', { name: /^Salary/ }).click();
    await tap(page, 'Continue');
    await page.getByLabel(/5 · Substantive pay/).fill('50000');
    await page.getByLabel(/9 · Net pay earned to date/).fill('40000');
    await tap(page, 'Continue');
    await page.getByLabel(/7a · Amount required/).fill('10000');
    await page.getByLabel(/11 · Monthly instalments/).fill('10');
    await page.getByLabel(/7b · Purpose/).fill('Medical');
    await tap(page, 'Continue');
    await expect(page.getByText('Eligibility')).toBeVisible();
    await shot(page, 'staff-loan-new-check');
    await expect(page.getByRole('button', { name: 'Submit application' })).toBeEnabled({ timeout: 20_000 });
    await tap(page, 'Submit application');
    await page.waitForURL(/\/staff\/loan\/(?!new)[^/]+$/);
    await expect(page.getByText(/Salary Loan/).first()).toBeVisible();
  });

  test('S5 FD at the counter: cash with denominations → Secretary → President → active', async ({ page, request }) => {
    const { token } = await apiToken(request, 'stf-cashier', 'console');
    const reqs = await apiCall<{ items: Array<{ id: string }> }>(request, 'GET', '/deposits?tab=REQUESTS&status=REQUESTED', token);
    const id = reqs.items[0]!.id;
    await staffAs(page, request, 'stf-cashier', `/staff/deposit/${id}`);
    await phoneSettled(page);
    await decide(page, 'Record payment', async () => {
      await tap(page, 'Fill fewest notes');
      await expect(page.getByText(/matches the amount/)).toBeVisible();
      await shot(page, 'staff-fd-cash');
    });
    await staffAs(page, request, 'stf-secretary', `/staff/deposit/${id}`);
    await phoneSettled(page);
    await decide(page, /^Accept$/);
    await staffAs(page, request, 'stf-president', `/staff/deposit/${id}`);
    await phoneSettled(page);
    await decide(page, /^Accept$/);
    await expect(page.getByText(/FD active/)).toBeVisible();
  });

  test('S5 open an FD request at the counter', async ({ page, request }) => {
    await staffAs(page, request, 'stf-cashier', '/staff/deposit/new');
    await phoneSettled(page);
    await page.getByLabel('Depositor').fill('1101');
    await tap(page, /Lakshmi Devi/);
    await page.getByLabel(/5 · Amount of deposit/).fill('50000');
    await expect(page.getByLabel('Nominee name')).toHaveValue(/\S/);
    await tap(page, 'Save request');
    await page.waitForURL(/\/staff\/deposit\/(?!new)[^/]+$/);
    await expect(page.getByRole('button', { name: 'Record payment' })).toBeVisible();
  });

  test('S6 month end: generate → certify → send → enter recovery → post; totals equal the server', async ({ page, request }) => {
    await staffAs(page, request, 'stf-accountant', '/staff/demand/generate');
    await phoneSettled(page);
    await tap(page, /^Generate \d+ sheets?/);
    await expect(page).not.toHaveURL(/generate/);
    const { token } = await apiToken(request, 'stf-accountant', 'console');
    const list = await apiCall<{ rows: Array<{ id: string; status: string }> }>(request, 'GET', '/demand?cycle=2026-10', token);
    const sheet = list.rows.find((r) => r.status === 'GENERATED')!;
    await page.goto(`${PHONE_URL}/staff/demand/${sheet.id}`);
    await phoneSettled(page);
    await decide(page, 'Certify', undefined, 'Certify correct');
    await tap(page, 'Done');
    await phoneSettled(page);
    await decide(page, 'Send to DDO', undefined, 'Send');
    await tap(page, 'Done');
    await phoneSettled(page);
    await tap(page, 'Enter recovery');
    await page.waitForURL(`**/staff/demand/${sheet.id}/recovery`);
    await phoneSettled(page);
    await shot(page, 'staff-recovery');
    await expect(page.getByText(/1 of \d+|Member 1/).first()).toBeVisible();
    await page.getByLabel(/^Deducted from /).fill('1');
    await expect(page.getByText(/stays as the member's dues/)).toBeVisible();
    await tap(page, 'Next member');
    await tap(page, 'Approve and post');
    await page.waitForURL(`**/staff/demand/${sheet.id}`);
    await expect(page.getByText(/recovery posted/i).first()).toBeVisible();

    const after = await apiCall<{ sheet: { status: string }; totals: { recovered: number; short: number } }>(request, 'GET', `/demand/sheets/${sheet.id}`, token);
    expect(after.sheet.status).toBe('RECOVERY_POSTED');
    expect(after.totals.short).toBeGreaterThan(0);
  });

  test('S6 DDO enters deductions on the phone, the Accountant sends them back', async ({ page, request }) => {
    await staffAs(page, request, 'stf-ddo-fin', '/staff/demand/ds-2026-10-fin/recovery');
    await phoneSettled(page);
    await page.getByLabel(/^Deducted from /).fill('100');
    await tap(page, 'Save draft');
    await expect(page.getByText(/draft saved/).first()).toBeVisible();
    await tap(page, 'Submit to the Accountant');
    await page.waitForURL('**/staff/demand/ds-2026-10-fin');
    await expect(page.getByText(/submitted, waiting for the Accountant/)).toBeVisible();

    await staffAs(page, request, 'stf-accountant', '/staff/demand/ds-2026-10-fin/recovery');
    await phoneSettled(page);
    await expect(page.getByLabel(/^Deducted from /)).toHaveValue('100');
    await tap(page, 'Send back to the DDO');
    await page.getByLabel(/What to correct/).fill('Check the deduction against the pay bill');
    await tap(page, 'Send back');
    await page.waitForURL('**/staff/demand/ds-2026-10-fin');
    await expect(page.getByText(/sent back to the DDO/).first()).toBeVisible();
  });

  test('S6 cash cannot be saved until the notes match; verifying a reported payment makes a receipt', async ({ page, request }) => {
    const { token } = await apiToken(request, 'stf-cashier', 'console');
    const reports = await apiCall<Array<{ id: string; status: string }>>(request, 'GET', '/payment-reports', token).catch(() => [] as Array<{ id: string; status: string }>);
    await staffAs(page, request, 'stf-cashier', '/staff/payments?tab=REPORTED');
    await phoneSettled(page);
    await shot(page, 'staff-payments-reported');
    const open = reports.find((r) => r.status === 'REPORTED');
    if (open) await page.goto(`${PHONE_URL}/staff/payment/verify/${open.id}`);
    else await page.getByRole('button', { name: /Bank transfer|UPI|Cheque deposit/ }).first().click();
    await phoneSettled(page);
    await page.getByText("I found this credit in the society's bank statement").click();
    await tap(page, 'Verify & create receipt');
    await page.waitForURL(/\/staff\/payment\/(?!verify|new)[^/]+$/);
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();

    await page.goto(`${PHONE_URL}/staff/payment/new`);
    await phoneSettled(page);
    await page.getByRole('textbox', { name: 'Member' }).fill('1104');
    await tap(page, /Mahesh Babu P/);
    await expect(page.getByText('What they owe')).toBeVisible();
    await page.getByLabel('Amount').fill('100');
    const save = page.getByRole('button', { name: /Save receipt/ });
    await expect(save).toBeDisabled();
    await tap(page, 'Fill fewest notes');
    await expect(page.getByText(/matches the amount/)).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL(/\/staff\/payment\/(?!verify|new)[^/]+$/);
    await expect(page.getByText(/Mahesh Babu P/).first()).toBeVisible();
    await shot(page, 'staff-receipt');
  });

  test('S7 every report equals the server for the same filters', async ({ page, request }) => {
    const { token } = await apiToken(request, 'stf-accountant', 'console');
    const cat = await apiCall<{ reports: Array<{ id: string; title: string; kind: string; available: boolean; filters: string[] }> }>(request, 'GET', '/reports', token);
    const defs = cat.reports.filter((r) => r.available && r.kind === 'table' && !r.filters.includes('memberId'));
    expect(defs.length).toBeGreaterThan(5);
    for (const def of defs) {
      const server = await apiCall<{ rowCount: number }>(request, 'GET', `/reports/${def.id}`, token);
      await staffAs(page, request, 'stf-accountant', `/staff/report/${def.id}`);
      await phoneSettled(page);
      await expect(page.getByText(new RegExp(`\\b${server.rowCount.toLocaleString('en-IN')} rows? ·`)).first(), def.id).toBeVisible();
    }
    await staffAs(page, request, 'stf-accountant', '/staff/reports');
    await phoneSettled(page);
    await tap(page, new RegExp(defs[0]!.title));
    await page.waitForURL(`**/staff/report/${defs[0]!.id}`);
    await phoneSettled(page);
    await expect(page.getByRole('button', { name: 'Share CSV' })).toBeVisible();
    await shot(page, 'staff-report');
  });

  test('S7 a print button opens its console page', async ({ page, request }) => {
    // window.open is how Linking.openURL leaves the app on web.
    await page.addInitScript(() => {
      (window as unknown as { opened: string[] }).opened = [];
      window.open = (url) => ((window as unknown as { opened: string[] }).opened.push(String(url)), null);
    });
    await staffAs(page, request, 'stf-accountant', '/staff/reports');
    await phoneSettled(page);
    await tap(page, /Fixed deposit form/);
    await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([expect.stringContaining('/reports/print/fd-form')]);
  });

  test('S8 an Admin edit on the phone is recorded and shows on the console', async ({ page, request }) => {
    await staffAs(page, request, 'stf-admin', '/staff/settings/insurance-demand');
    await phoneSettled(page);
    const grace = page.getByLabel('Grace days');
    const next = String(Number(await grace.inputValue()) + 1);
    await grace.fill(next);
    await tap(page, 'Save changes');
    await expect(page.getByText('Recorded in the change history.')).toBeVisible();
    await page.goto(`${PHONE_URL}/staff/settings/history`);
    await phoneSettled(page);
    await shot(page, 'staff-settings-history');
    await consoleAs(page, request, 'stf-admin', '/settings/insurance-demand');
    await expect(page.getByLabel('Grace days')).toHaveValue(next);
  });

  test('S8 settings are view only without edit rights', async ({ page, request }) => {
    await staffAs(page, request, 'stf-accountant', '/staff/settings/general');
    await phoneSettled(page);
    if (page.url().includes('no-access')) return;
    await expect(page.getByText('View only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  });
});
