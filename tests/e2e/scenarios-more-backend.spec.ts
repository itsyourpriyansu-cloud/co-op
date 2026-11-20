// The flows that had server tests only, now driven through the screens (owner request, 2026-11-20):
// profile change, loan top-up, early closure, recovery from sureties, receipt cancellation, FD payout
// and renewal, supplementary demand sheet, office voucher and the year end. Against the backend.
import type { APIRequestContext, Page } from '@playwright/test';
import {
  API,
  apiCall,
  apiToken,
  consoleAs,
  expect,
  OTP,
  phoneAs,
  phoneSettled,
  resetDemo,
  staffAs,
  tap,
  test,
} from './support';

const token = async (request: APIRequestContext, persona: string) =>
  (await apiToken(request, persona, 'console')).token;

/** A phone picker: open it by its label, choose the option. */
async function pick(page: Page, field: string, option: string | RegExp) {
  await page.getByRole('button', { name: new RegExp(`^${field}:`) }).click();
  await page.getByText(option).last().click();
}

/** The staff screens confirm before money moves (window.confirm on the web build): say yes. */
const acceptDialogs = (page: Page) => page.on('dialog', (d) => void d.accept());

test.describe('more owner scenarios · backend', () => {
  test.beforeAll(async ({ request }) => resetDemo(request));
  test.afterAll(async ({ request }) => {
    await request.post(`${API}/__demo/clock`, { data: { today: null } });
    await resetDemo(request);
  });

  test('profile change: the member asks in the app, the Accountant approves, the record changes', async ({
    page,
    request,
  }) => {
    await phoneAs(page, request, 'mem-1103', '/profile/request');
    await phoneSettled(page);
    await page.getByRole('checkbox', { name: /^Nominee name/ }).click();
    await page.getByLabel('Correct nominee name').fill('Test Nominee Rao');
    await page.getByLabel('Reason').fill('Nominee name spelt wrongly in the register');
    await tap(page, 'Send request');
    await expect(page.getByRole('button', { name: 'Back to my profile' })).toBeVisible();

    await consoleAs(page, request, 'stf-accountant', '/members/change-requests');
    await page.getByRole('button', { name: 'Decide' }).first().click();
    await page.getByRole('button', { name: 'Approve & update profile' }).click();
    await expect(page.getByText('Approved. Profile updated').first()).toBeVisible();
    const m = await apiCall<{ member: { nominee: { name: string } } }>(
      request,
      'GET',
      '/members/mem-1103',
      await token(request, 'stf-accountant'),
    );
    expect(m.member.nominee.name).toBe('Test Nominee Rao');
  });

  test('top-up: Lakshmi tops up her running loan in the app; once paid, the old loan closes by settlement', async ({
    page,
    request,
  }) => {
    const me = (await apiToken(request, 'mem-1101', 'app')).token;
    const ctx = await apiCall<{ topupCandidates: Array<{ id: string; loanNo: string }> }>(
      request,
      'GET',
      '/me/loans/context',
      me,
    );
    const parent = ctx.topupCandidates[0]!;
    await phoneAs(page, request, 'mem-1101', `/loan/apply?topup=${parent.id}`);
    await phoneSettled(page);
    await tap(page, 'Save & continue'); // pay details are pre-filled
    await page.getByLabel('Amount you need').fill('100000');
    await page.getByLabel('What is it for?').fill('House repair (top-up)');
    await page.getByLabel('Bank name').fill('State Bank of India');
    await page.getByLabel('Account number').fill('12345678901');
    await page.getByLabel('IFSC').fill('SBIN0001234');
    await expect(page.getByText('You are eligible')).toBeVisible({ timeout: 20_000 });
    await tap(page, 'Save & continue');
    for (const q of ['Sravani', '1104']) {
      await page.getByLabel('Find a member').fill(q);
      await page
        .getByRole('button', { name: q === '1104' ? /Mahesh Babu P/ : /Sravani M/ })
        .first()
        .click();
    }
    await tap(page, 'Save & continue');
    await tap(page, 'Sign with OTP');
    await page.getByLabel('One-time password').last().click();
    await page.keyboard.type(OTP);
    await tap(page, 'Confirm & submit');
    await page.waitForURL(
      (url) => /\/loan\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/apply'),
      { timeout: 20_000 },
    );
    const loanId = new URL(page.url()).pathname.split('/').pop()!;

    // Sureties, review, DDO, assessment, sanction and payment through the demo control.
    const acc = await token(request, 'stf-accountant');
    for (let i = 0; i < 12; i++) {
      const d = await apiCall<{ loan: { status: string } }>(
        request,
        'GET',
        `/loans/${loanId}`,
        acc,
      );
      if (d.loan.status === 'ACTIVE') break;
      await apiCall(request, 'POST', `/loans/${loanId}/demo-act`, acc);
    }
    await consoleAs(page, request, 'stf-accountant', `/loans/${parent.id}`);
    await expect(
      page.getByText(/Closed by top-up|CLOSED_BY_TOPUP|settled by top-up/i).first(),
    ).toBeVisible();
  });

  test('early closure: the Cashier takes the closing payment; the loan closes', async ({
    page,
    request,
  }) => {
    const cash = await token(request, 'stf-cashier');
    const active = await apiCall<{ items: Array<{ id: string }> }>(
      request,
      'GET',
      '/loans?group=ACTIVE&pageSize=25',
      cash,
    );
    let loanId = '';
    for (const l of active.items) {
      const q = await apiCall<{ canClose: boolean }>(
        request,
        'GET',
        `/loans/${l.id}/closure`,
        cash,
      );
      if (q.canClose) {
        loanId = l.id;
        break;
      }
    }
    expect(loanId, 'a loan that can close today').not.toBe('');
    await consoleAs(page, request, 'stf-cashier', `/loans/${loanId}`);
    await page.getByRole('button', { name: 'Take the closing payment' }).click();
    await page.getByRole('radio', { name: /Bank transfer/ }).click();
    await page.getByLabel('UTR / reference').fill('UTR-CLOSE-0001');
    await page.getByRole('button', { name: /^Save receipt · / }).click();
    await page.waitForURL(/\/payments\/[^/]+$/);
    const loan = await apiCall<{ loan: { status: string } }>(
      request,
      'GET',
      `/loans/${loanId}`,
      cash,
    );
    expect(loan.loan.status).toBe('CLOSED');
  });

  test('recovery from sureties: an overdue loan is split between the sureties', async ({
    page,
    request,
  }) => {
    const acc = await token(request, 'stf-accountant');
    const sheet = await apiCall<{
      lines: Array<{ memberId: string; components: Array<{ head: string; loanId?: string }> }>;
    }>(request, 'GET', '/demand/sheets/ds-2026-10-fin', acc);
    let pick: { memberId: string; loanId: string } | undefined;
    for (const l of sheet.lines) {
      const loanId = l.components.find((c) => c.head === 'PRINCIPAL')?.loanId;
      if (!loanId) continue;
      const d = await apiCall<{ loan: { sureties: Array<{ status: string }> } }>(
        request,
        'GET',
        `/loans/${loanId}`,
        acc,
      );
      if (d.loan.sureties.filter((s) => s.status === 'ACCEPTED').length >= 2) {
        pick = { memberId: l.memberId, loanId };
        break;
      }
    }
    expect(pick, 'a loan with two sureties on the October sheet').toBeDefined();
    await apiCall(request, 'POST', '/demand/sheets/ds-2026-10-fin/actions/postRecovery', acc, {
      recovered: { [pick!.memberId]: 0 },
    });
    await apiCall(request, 'PUT', '/settings/values', await token(request, 'stf-admin'), {
      suretyRecoveryAfterCycles: 1,
    });

    await consoleAs(page, request, 'stf-accountant', `/loans/${pick!.loanId}`);
    await page.getByRole('button', { name: 'Recover from sureties' }).click();
    await page.getByRole('button', { name: 'Yes, ask the sureties' }).click();
    await expect
      .poll(
        async () =>
          (
            await apiCall<{ recoveries: unknown[] }>(
              request,
              'GET',
              `/loans/${pick!.loanId}/surety-recovery`,
              acc,
            )
          ).recoveries.length,
      )
      .toBe(2);
  });

  test('receipt cancellation: another officer cancels a wrong receipt the same day, with a reason', async ({
    page,
    request,
  }) => {
    const cash = await token(request, 'stf-cashier');
    const state = await apiCall<{ today: string }>(request, 'GET', '/__demo/state');
    const dues = await apiCall<{ totalArrears: number }>(
      request,
      'GET',
      '/members/mem-1104/dues',
      cash,
    );
    const amount = Math.min(dues.totalArrears, 50_000);
    expect(amount).toBeGreaterThan(0);
    const r = await apiCall<{ receipt: { id: string; receiptNo: string } }>(
      request,
      'POST',
      '/receipts',
      cash,
      {
        memberId: 'mem-1104',
        purpose: 'DUES',
        mode: 'BANK_TRANSFER',
        amount,
        date: state.today,
        reference: 'UTR-WRONG-0001',
      },
    );

    await consoleAs(page, request, 'stf-accountant', `/payments/${r.receipt.id}`);
    await page.getByRole('button', { name: 'Cancel receipt' }).first().click();
    await page
      .getByLabel('Reason')
      .fill('Taken against the wrong member; re-issued to the right one.');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel receipt' }).click();
    await expect(page.getByText(/CANCELLED|Cancelled/).first()).toBeVisible();
  });

  test('FD maturity: the Cashier pays out one matured FD and renews another; the renewal is accepted', async ({
    page,
    request,
  }) => {
    const cash = await token(request, 'stf-cashier');
    const matured = await apiCall<{ items: Array<{ id: string }> }>(
      request,
      'GET',
      '/deposits?tab=FD&status=MATURED&pageSize=5',
      cash,
    );
    const [payId, renewId] = [matured.items[0]!.id, matured.items[1]!.id];

    await consoleAs(page, request, 'stf-cashier', `/deposits/${payId}`);
    await page.getByRole('button', { name: 'Pay out' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pay out' }).click();
    await expect
      .poll(
        async () =>
          (
            await apiCall<{ deposit: { status: string } }>(
              request,
              'GET',
              `/deposits/${payId}`,
              cash,
            )
          ).deposit.status,
      )
      .toBe('CLOSED');
    await page.reload();
    await expect(page.getByRole('button', { name: /^Voucher / }).first()).toBeVisible();

    await consoleAs(page, request, 'stf-cashier', `/deposits/${renewId}`);
    await page.getByRole('button', { name: 'Renew' }).first().click();
    await page.getByLabel('New tenure (months)').fill('24');
    await page.getByRole('dialog').getByRole('button', { name: 'Renew' }).click();
    const renewed = await expect
      .poll(
        async () =>
          (
            await apiCall<{ deposit: { renewedTo?: { id: string } } }>(
              request,
              'GET',
              `/deposits/${renewId}`,
              cash,
            )
          ).deposit.renewedTo?.id ?? '',
      )
      .not.toBe('')
      .then(
        async () =>
          (
            await apiCall<{ deposit: { renewedTo: { id: string } } }>(
              request,
              'GET',
              `/deposits/${renewId}`,
              cash,
            )
          ).deposit.renewedTo.id,
      );
    const acc = await token(request, 'stf-accountant');
    for (let i = 0; i < 2; i++)
      await apiCall(request, 'POST', `/deposits/${renewed}/demo-act`, acc);
    const fresh = await apiCall<{ deposit: { status: string; fdrNo?: string } }>(
      request,
      'GET',
      `/deposits/${renewed}`,
      acc,
    );
    expect(fresh.deposit).toMatchObject({
      status: 'ACTIVE',
      fdrNo: expect.stringMatching(/^FDR-/),
    });
  });

  test('supplementary demand: a member added after Certify goes on a supplementary sheet', async ({
    page,
    request,
  }) => {
    const acc = await token(request, 'stf-accountant');
    const sheetId = 'ds-2026-11-fin';
    // November is not generated yet at the demo date: generate Finance, then certify it.
    await apiCall(request, 'POST', '/demand/generate', acc, { cycle: '2026-11', departmentIds: ['dept-fin'] });
    await apiCall(request, 'POST', `/demand/sheets/${sheetId}/actions/certify`, acc);
    const s = await apiCall<{ settings: { casteCategories: string[] } }>(
      request,
      'GET',
      '/settings',
      acc,
    );
    const address = {
      line1: '4-5-6, Test Lane',
      city: 'Hyderabad',
      district: 'Hyderabad',
      pincode: '500004',
    };
    const added = await apiCall<{ member: { id: string } }>(request, 'POST', '/members', acc, {
      name: 'Late Joiner Test',
      fatherName: 'Test Father',
      gender: 'M',
      caste: s.settings.casteCategories[0],
      dob: '1992-03-10',
      mobile: '9000054321',
      presentAddress: address,
      permanentAddress: address,
      employeeId: 'TS77002',
      departmentId: 'dept-fin',
      designation: 'Junior Assistant',
      doj: '2016-07-01',
      dor: '2053-03-31',
      employmentType: 'REGULAR',
      numberOfShares: 10,
      nominee: { name: 'Test Nominee', relation: 'Father' },
      payProfile: {
        scaleOfPay: '24280-72850',
        grossSalary: 5_000_000,
        substantivePay: 4_000_000,
        govtLoanDeductions: 0,
        otherLoanDeductions: 0,
      },
    });

    await consoleAs(page, request, 'stf-accountant', `/demand-sheets/${sheetId}`);
    await page.getByRole('button', { name: 'Add missing members' }).click();
    await expect(page.getByRole('dialog').getByText('Late Joiner Test')).toBeVisible();
    await page.getByRole('button', { name: 'Make supplementary sheet' }).click();
    await page.waitForURL(new RegExp(`/demand-sheets/${sheetId}-s1$`));
    await expect(page.getByText(/Supplement 1/).first()).toBeVisible();
    const supp = await apiCall<{ lines: Array<{ memberId: string }> }>(
      request,
      'GET',
      `/demand/sheets/${sheetId}-s1`,
      acc,
    );
    expect(supp.lines.map((l) => l.memberId)).toEqual([added.member.id]);
  });

  test('office voucher: the Accountant pays an expense on the phone and prints the voucher', async ({
    page,
    request,
  }) => {
    acceptDialogs(page);
    await staffAs(page, request, 'stf-accountant', '/staff/accounts/voucher/new');
    await phoneSettled(page);
    await page.getByRole('button', { name: /^Expense head:/ }).click();
    await page.getByLabel('Search').fill('stationery');
    await page
      .getByText(/Printing and stationery/)
      .last()
      .click();
    await page.getByLabel('Amount').fill('1250');
    await page.getByLabel('Paid to').fill('Test Stationers');
    await page.getByLabel('What it is for').fill('Registers for November');
    await tap(page, /^Save · /);
    await page.waitForURL(/\/staff\/accounts\/voucher\/(?!new)[^/]+$/);
    await expect(page.getByText('Test Stationers').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Print Voucher / })).toBeVisible();
  });

  test('year end: after 31 March the Accountant credits interest, closes the year and declares the dividend', async ({
    page,
    request,
  }) => {
    acceptDialogs(page);
    await request.post(`${API}/__demo/clock`, { data: { today: '2027-04-10' } });
    await staffAs(page, request, 'stf-accountant', '/staff/accounts/year-end');
    await phoneSettled(page);
    await pick(page, 'Financial year', '2026-27');
    await tap(page, 'Credit the interest');
    await expect(page.getByText('Interest credited')).toBeVisible();
    await tap(page, 'Close the year');
    await expect(page.getByText('Year closed')).toBeVisible();
    await page.getByLabel('Rate').fill('8');
    await page.getByLabel('General body resolution').fill('Res. 4 of 20 Jun 2027');
    await tap(page, 'Declare');
    await expect(page.getByText('8% declared')).toBeVisible();
  });
});
