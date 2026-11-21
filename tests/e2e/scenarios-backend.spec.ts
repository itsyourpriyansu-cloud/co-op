// Scenarios the other journeys don't cover (owner request, 2026-11-20): staff add a member, the Admin
// adds users and DDO logins (many per department, one in charge, D-142), edits permissions (D-134), and the office
// enters a loan with the bank account it is paid into (D-132). Against the backend.
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiToken,
  consoleAs,
  expect,
  PHONE_URL,
  phoneSettled,
  resetDemo,
  staffAs,
  tap,
  test,
} from './support';

/** The Finance row of Departments & DDOs (the Users table, kept in the page, also says "Finance"). */
const financeRow = (page: Page) => page.getByRole('row').filter({ has: page.getByRole('gridcell', { name: 'FIN', exact: true }) });

/** Console Departments & DDOs: edit Finance and choose the DDO in charge. */
async function setInCharge(page: Page, option: string) {
  await financeRow(page).getByRole('button', { name: 'Edit' }).click();
  // Blend's select trigger is a button named by its current value (the DDO in charge).
  await page.getByRole('dialog').getByRole('button', { name: / · ddo\./ }).click();
  await page.getByRole('menuitem', { name: option }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** A phone picker: open it by its label, choose the option. */
async function pick(page: Page, field: string, option: string | RegExp) {
  await page.getByRole('button', { name: new RegExp(`^${field}:`) }).click();
  await page.getByText(option).last().click();
}

test.describe('owner scenarios · backend', () => {
  test.beforeAll(async ({ request }) => resetDemo(request));

  test('Admin adds a user and sees it at once; a second DDO login joins the department and can be put in charge', async ({
    page,
    request,
  }) => {
    // The demo reset keeps staff users added earlier, so each run uses a new user ID.
    const userId = `kavitha.${Date.now().toString(36).slice(-6)}`;
    await consoleAs(page, request, 'stf-admin', '/settings/users');
    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByLabel('Full name').fill('Kavitha Rao');
    await page.getByLabel('User ID').fill(userId);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // Shown in the list without leaving the tab (the old bug).
    await expect(page.getByText(userId)).toBeVisible();

    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByRole('radio', { name: /^DDO/ }).click();
    await page.getByRole('button', { name: 'Finance', exact: true }).click();
    const ddoId = `ddo.${Date.now().toString(36).slice(-6)}`;
    await page.getByLabel('Full name').fill('Lakshmi Prasanna');
    await page.getByLabel('User ID').fill(ddoId);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(ddoId)).toBeVisible();

    // Departments & DDOs lists both logins at once; Kiran Kumar stays in charge until the Admin chooses.
    await page.goto(page.url().replace('/settings/users', '/settings/departments'));
    const finance = financeRow(page);
    await expect(finance.getByRole('listitem', { name: 'Kiran Kumar · ddo.fin · in charge' })).toBeVisible();
    await expect(finance.getByRole('listitem', { name: `Lakshmi Prasanna · ${ddoId}`, exact: true })).toBeVisible();
    await expect(finance.getByText('In charge')).toHaveCount(1);
    await setInCharge(page, `Lakshmi Prasanna · ${ddoId}`);
    await expect(finance.getByRole('listitem', { name: `Lakshmi Prasanna · ${ddoId} · in charge` })).toBeVisible();
    // Hand it back so the other journeys keep their DDO.
    await setInCharge(page, 'Kiran Kumar · ddo.fin');
    await expect(finance.getByRole('listitem', { name: 'Kiran Kumar · ddo.fin · in charge' })).toBeVisible();
  });

  test('only the Super Admin edits permissions, and admin-only rights stay locked', async ({
    page,
    request,
  }) => {
    await consoleAs(page, request, 'stf-admin', '/settings/permissions');
    const box = page.getByRole('checkbox', { name: 'Cashier / Disbursement: Reports' });
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('checkbox', { name: 'Accountant: Manage users' })).toHaveCount(0);
    await expect(
      page.getByRole('img', { name: /Accountant: Manage users: no \(locked\)/ }),
    ).toBeVisible();

    await consoleAs(page, request, 'stf-accountant', '/settings/permissions');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('staff add a member on the phone; Employee ID is required; the console shows the member', async ({
    page,
    request,
  }) => {
    const { token } = await apiToken(request, 'stf-accountant', 'console');
    const s = await apiCall<{ settings: { casteCategories: string[] } }>(
      request,
      'GET',
      '/settings',
      token,
    );
    await staffAs(page, request, 'stf-accountant', '/staff/member/new');
    await phoneSettled(page);
    await page.getByLabel('Full name').fill('Test Member Ananya');
    await page.getByLabel("Father's name").fill('Test Father');
    await page.getByLabel('Date of birth').fill('15/06/1990');
    await pick(page, 'Caste', s.settings.casteCategories[0]!);
    await page.getByLabel('Mobile').fill('9000012345');
    await tap(page, 'Continue');
    await page.getByLabel('House / street').fill('1-2-3, Test Street');
    await page.getByLabel('City / town').fill('Hyderabad');
    await page.getByLabel('District').fill('Hyderabad');
    await page.getByLabel('PIN code').fill('500004');
    await tap(page, 'Continue');
    await pick(page, 'Department', 'Finance');
    await pick(page, 'Designation', /Junior Assistant/);
    await page.getByLabel('Date of joining service').fill('01/07/2015');
    await tap(page, 'Continue');
    await page.getByLabel('Nominee name').fill('Test Nominee');
    await tap(page, 'Continue');
    await page.getByLabel('Number of shares').fill('10');
    await tap(page, 'Continue');
    await page.getByLabel('Scale of pay').fill('24280-72850');
    await page.getByLabel('Gross salary (monthly)').fill('50000');
    await page.getByLabel('Substantive pay').fill('40000');
    // No Employee ID yet: the form goes back to it.
    await tap(page, 'Add member');
    await expect(page.getByText('Some details need attention')).toBeVisible();
    await page.getByLabel('Employee ID').fill('TS77001');
    for (let i = 0; i < 3; i++) await tap(page, 'Continue');
    await tap(page, 'Add member');
    await page.waitForURL(/\/staff\/member\/(?!new)[^/]+$/);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByText('TS77001')).toBeVisible();

    await consoleAs(page, request, 'stf-accountant', `/members/${id}`);
    await expect(page.getByText('Test Member Ananya').first()).toBeVisible();
    await expect(page.getByText('TS77001')).toBeVisible();
  });

  test('the office enters a salary loan with the bank account; it shows on the loan and the form', async ({
    page,
    request,
  }) => {
    await consoleAs(page, request, 'stf-accountant', '/loans/new');
    await page.getByPlaceholder('Search by name or General No.').fill('1103');
    await page
      .getByText(/Sravani M/)
      .first()
      .click();
    await page.getByRole('radio', { name: /^Salary Loan/ }).click();
    await page.getByLabel('9 · Net pay earned to date').fill('40000');
    await page.getByLabel('7a · Amount required').fill('10000');
    await page.getByRole('radio', { name: '12 months' }).click();
    await page.getByLabel('7b · Purpose').fill('Medical');
    await page.getByLabel('Bank name').fill('State Bank of India');
    await page.getByLabel('Account number').fill('12345678901');
    await page.getByLabel('IFSC').fill('SBIN0001234');
    await expect(page.getByRole('button', { name: 'Submit application' })).toBeEnabled({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Submit application' }).click();
    await page.waitForURL(/\/loans\/(?!new)[^/]+$/);
    await expect(
      page.getByText(/State Bank of India · A\/c 12345678901 · IFSC SBIN0001234/).first(),
    ).toBeVisible();

    // The printed F3 carries the same account; opened from the loan, its back button returns there.
    await page.getByRole('button', { name: 'Print form' }).click();
    await expect(page.getByText('APPLICATION FOR SALARY LOAN')).toBeVisible();
    await expect(page.getByText(/A\/c 12345678901/)).toBeVisible();
    await page.getByRole('button', { name: 'Back to Loans' }).click();
    await page.waitForURL(/\/loans\/(?!new)[^/]+$/);
  });

  test('the phone loan screen makes the office copies in the app', async ({ page, request }) => {
    const { token } = await apiToken(request, 'stf-accountant', 'console');
    const loans = await apiCall<{ items: Array<{ id: string; status: string }> }>(
      request,
      'GET',
      '/loans?group=ACTIVE&pageSize=1',
      token,
    );
    await staffAs(page, request, 'stf-accountant', `/staff/loan/${loans.items[0]!.id}`);
    await phoneSettled(page);
    await expect(
      page.getByRole('button', { name: /^Download PDF of .*loan application/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Print Repayment schedule/ })).toBeVisible();
    expect(PHONE_URL).toBeTruthy();
  });
});
