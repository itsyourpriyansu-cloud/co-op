// D-131 against the backend: the Super Admin proposes a new date of retirement in the console, the
// Accountant approves in the console, the Secretary in the staff screens of the app, the President in
// the console; the member sees service left and their loan record in the app.
import { consoleAs, expect, phoneContext, phoneAs, phoneSettled, resetDemo, shot, staffAs, test } from './support';

const MEMBER = 'mem-1101';

test.describe('service and the date of retirement (D-131)', () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test('Super Admin proposes; Accountant, Secretary (app) and President approve; the date changes', async ({ page, request, browser }) => {
    await consoleAs(page, request, 'stf-admin', `/members/${MEMBER}`);
    await page.getByRole('button', { name: 'Change date of retirement' }).click();
    await page.getByLabel('New date of retirement').fill('2043-03-31');
    await page.getByLabel('Reason').fill('Service register entry corrected');
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText(/waiting for the Accountant/)).toBeVisible();
    await shot(page, 'd131-proposed');

    await consoleAs(page, request, 'stf-accountant', `/members/${MEMBER}`);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/waiting for the Secretary/)).toBeVisible();

    const { context, page: phone } = await phoneContext(browser);
    phone.on('dialog', (d) => void d.accept());
    await staffAs(phone, request, 'stf-secretary', `/staff/member/${MEMBER}`);
    await phoneSettled(phone);
    await expect(phone.getByText(/Waiting for the Secretary/)).toBeVisible();
    await phone.getByRole('button', { name: 'Approve' }).click();
    await expect(phone.getByText(/Waiting for the President/)).toBeVisible();
    await shot(phone, 'd131-staff-app');
    await context.close();

    await consoleAs(page, request, 'stf-president', `/members/${MEMBER}`);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/· approved/)).toBeVisible();
    await expect(page.getByText('31 Mar 2043').first()).toBeVisible();
    await shot(page, 'd131-approved');
  });

  test('the member sees service remaining and their loan record', async ({ browser, request }) => {
    const { context, page } = await phoneContext(browser);
    await phoneAs(page, request, MEMBER, '/home');
    await phoneSettled(page);
    await expect(page.getByText('Service remaining')).toBeVisible();
    await expect(page.getByText(/days\)/)).toBeVisible();
    await shot(page, 'd131-home');
    await page.goto(page.url().replace(/\/home.*/, '/loans'));
    await phoneSettled(page);
    await expect(page.getByText(/Applied \d+ · Approved \d+ · Rejected \d+/)).toBeVisible();
    await context.close();
  });
});
