// M8 Member app completion: MA-01 sign-in with General No. / Employee ID + password, MA-02 activation
// (Employee ID + registered mobile → OTP → set password), MA-03 forgot password, MB-17 change password,
// MB-01 home snapshot, MB-12 notifications, MB-13 help & support, MB-14 preferences.
// Passwords are scrypt-hashed in the store; activated members without one use the demo password (D-062).
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { calculateLeftoverService, checkPassword, formatCycle, formatINR } from '@tgs/domain';
import type { AccountOtp, ActivationSample, Member, MemberHome, MemberPreferences, MyNotifications, PasswordCheck, PasswordToken, Session, SessionUser, SupportCenter, SupportTicket } from '@tgs/types';
import { memberDues } from './collections';
import { audit, nowIso, requireMember, type Api, type Guard } from './common';
import { fail } from './errors';
import type { Db, Store } from './store';

export const DEMO_PASSWORD = 'Society@2026';
const DEMO_OTP = '123456';
const OTP_TTL = 300;
const TOKEN_TTL = 600;

const OFFICE: SupportCenter['office'] = {
  name: 'TGSECCSL Society Office',
  address: '2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004',
  phone: '040-2345 0929',
  email: 'office@tgseccsl.example.org',
  whatsapp: '+91 90000 00929',
  hours: 'Mon–Sat, 10:30 am – 5:00 pm (closed on 2nd Saturday and public holidays)',
};

const TICKET_CATEGORIES: NonNullable<SupportTicket['category']>[] = ['LOAN', 'DEPOSIT', 'PAYMENT', 'PROFILE', 'APP', 'OTHER'];

const FAQS: SupportCenter['faqs'] = [
  { topic: 'Loans', q: 'How much can I borrow?', a: 'It depends on the loan, your salary and your remaining service: the loan must end before you retire (BR-002). The Apply screen shows your limit as you type.' },
  { topic: 'Loans', q: 'Why does my surety have to confirm?', a: 'A surety promises to repay if you cannot. They confirm their details and sign with an OTP in their own app before the office reviews your loan.' },
  { topic: 'Loans', q: 'What is a top-up?', a: 'A new, bigger loan that first pays off what you still owe on your running loan (with interest up to today). You receive the rest.' },
  { topic: 'Payments', q: 'Why was my deduction short?', a: 'Your department deducts what your salary allows. A short amount is applied in the society order (RRF, insurance, CRD, interest, principal) and the rest stays unpaid. Pay it at the counter or by bank and report it.' },
  { topic: 'Payments', q: 'I paid by UPI. What now?', a: 'Report the payment from Payments → Report with the UTR number. The cashier matches it with the bank statement and you get a receipt.' },
  { topic: 'Deposits', q: 'When does my FD start earning interest?', a: 'From the day the society receives your money. You get the FD receipt (FDR) when the Secretary and the President accept it.' },
  { topic: 'Deposits', q: 'Can I borrow against my FD?', a: 'Yes. Open the FD and choose "Take a loan against this FD": you can borrow up to 90% of it without breaking it.' },
  { topic: 'Account', q: 'I forgot my password.', a: 'Use "Forgot password" on the sign-in screen. We send an OTP to your registered mobile.' },
];

function hash(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}

function passwordMatches(db: Db, memberId: string, password: string): boolean {
  const c = db.credentials[memberId];
  if (!c) return password === DEMO_PASSWORD;
  const given = Buffer.from(hash(password, c.salt).hash, 'hex');
  return timingSafeEqual(given, Buffer.from(c.hash, 'hex'));
}

const masked = (mobile: string) => `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`;

function findMember(db: Db, login: string): Member | undefined {
  const v = login.trim().toUpperCase();
  if (!v) return undefined;
  return db.members.find((m) => m.generalNo === v || m.employeeId.toUpperCase() === v);
}

function sessionFor(db: Db, m: Member): Session {
  const user: SessionUser = { id: m.id, name: m.name, role: 'MEMBER', memberId: m.id, generalNo: m.generalNo };
  const token = randomUUID();
  db.sessions[token] = user;
  return { token, user };
}

function homeFor(db: Db, m: Member): MemberHome {
  const today = db.demo.today;
  const leftover = calculateLeftoverService(m.dor, today);
  const share = db.shareAccounts.find((s) => s.memberId === m.id);
  const deps = db.deposits.filter((d) => d.memberId === m.id);
  const fds = deps.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE');
  const bal = (scheme: string) => deps.filter((d) => d.scheme === scheme && d.status === 'ACTIVE').reduce((s, d) => s + d.balance, 0);
  const fd = fds.reduce((s, d) => s + (d.principal ?? 0), 0);
  const next = [...fds].filter((d) => d.maturityDate).sort((a, b) => a.maturityDate!.localeCompare(b.maturityDate!))[0];
  const productName = (code: string) => db.loanProducts.find((p) => p.code === code)?.name ?? code;
  const myLoans = db.loans.filter((l) => l.memberId === m.id);
  const loans = myLoans
    .filter((l) => l.status === 'ACTIVE')
    .map((l) => {
      const due = l.schedule.find((r) => r.dueCycle >= db.currentCycle && r.paidStatus !== 'PAID');
      return { id: l.id, productName: productName(l.product), loanNo: l.loanNo ?? l.applicationNo, outstanding: l.outstandingPrincipal, ...(due ? { nextDue: { cycle: due.dueCycle, amount: due.emi } } : {}) };
    });
  const sheet = db.demandSheets.find((s) => s.cycle === db.currentCycle && s.lines.some((l) => l.memberId === m.id));
  const dues = memberDues(db, m.id);
  const actions: MemberHome['actions'] = [];
  const asSurety = db.loans.filter((l) => l.status === 'SURETY_PENDING' && l.sureties.some((s) => s.memberId === m.id && s.status === 'PENDING'));
  if (asSurety.length) {
    const borrower = db.members.find((x) => x.id === asSurety[0]!.memberId);
    actions.push({ key: 'surety', title: asSurety.length === 1 ? `${borrower?.name ?? 'A member'} asked you to be a surety` : `${asSurety.length} surety requests`, detail: 'Read the loan and sign with an OTP, or decline.', link: '/surety', tone: 'warning' });
  }
  for (const l of myLoans.filter((x) => x.status === 'RETURNED')) actions.push({ key: `returned-${l.id}`, title: 'Your loan needs a correction', detail: `${productName(l.product)} ${l.applicationNo}`, link: `/loan/${l.id}`, tone: 'warning' });
  for (const l of myLoans.filter((x) => x.status === 'DRAFT')) actions.push({ key: `draft-${l.id}`, title: 'Finish your loan application', detail: `${productName(l.product)} · not submitted yet`, link: `/loan/${l.id}`, tone: 'primary' });
  for (const l of myLoans.filter((x) => x.status === 'SURETY_PENDING' && x.sureties.some((s) => s.status === 'DECLINED'))) actions.push({ key: `declined-${l.id}`, title: 'A surety declined', detail: 'Choose another member to stand surety.', link: `/loan/${l.id}`, tone: 'danger' });
  for (const d of deps.filter((x) => x.status === 'REQUESTED')) actions.push({ key: `fd-${d.id}`, title: `Pay ${formatINR(d.principal ?? 0)} for your FD`, detail: `Request ${d.accountNo} · at the counter or by transfer`, link: `/deposit/${d.id}`, tone: 'primary' });
  if (dues.totalArrears + dues.shareCapitalDue > 0) actions.push({ key: 'dues', title: `${formatINR(dues.totalArrears + dues.shareCapitalDue)} unpaid`, detail: dues.arrears.length ? `Short deduction in ${dues.arrears.map((a) => formatCycle(a.cycle)).join(', ')}` : 'Share capital', link: '/payments', tone: 'danger' });
  return {
    member: { name: m.name, generalNo: m.generalNo, designation: m.designation, departmentName: db.departments.find((d) => d.id === m.departmentId)?.name ?? '', leftoverMonths: leftover.months, leftoverLabel: leftover.label },
    shares: { count: share?.numberOfShares ?? m.numberOfShares, capital: share?.shareCapital ?? 0, shareDeposit: share?.shareDepositBalance ?? 0 },
    deposits: { total: fd + bal('CRD') + bal('SRDS') + bal('SAVINGS'), fd, fdCount: fds.length, crd: bal('CRD'), srds: bal('SRDS'), savings: bal('SAVINGS'), ...(next ? { nextMaturity: { date: next.maturityDate!, amount: next.maturityValue ?? next.principal ?? 0, fdrNo: next.fdrNo ?? next.accountNo } } : {}) },
    loans,
    loansOutstanding: loans.reduce((s, l) => s + l.outstanding, 0),
    ...(sheet ? { thisMonth: { cycle: sheet.cycle, demand: sheet.lines.find((l) => l.memberId === m.id)!.totalDemand, status: sheet.status } } : {}),
    unpaid: dues.totalArrears + dues.shareCapitalDue,
    actions,
    unreadNotifications: db.notifications.filter((n) => n.recipientId === m.id && !n.read).length,
  };
}

export function registerAccount(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const otps = new Map<string, { memberId: string; purpose: 'activate' | 'reset'; expiresAt: number }>();
  const tokens = new Map<string, { memberId: string; purpose: 'activate' | 'reset'; expiresAt: number }>();
  const challenge = (m: Member, purpose: 'activate' | 'reset'): AccountOtp => {
    const otpRef = randomUUID();
    otps.set(otpRef, { memberId: m.id, purpose, expiresAt: Date.now() + OTP_TTL * 1000 });
    return { otpRef, expiresInSeconds: OTP_TTL, mobileMasked: masked(m.mobile), name: m.name, demoOtp: DEMO_OTP };
  };
  const me = (user: SessionUser) => {
    const id = requireMember(user);
    return db().members.find((m) => m.id === id) ?? fail('NOT_FOUND', 'Member record not found.');
  };
  const setPassword = (m: Member, password: string) => {
    const check = checkPassword(password, { generalNo: m.generalNo, employeeId: m.employeeId, mobile: m.mobile });
    if (!check.ok) fail('VALIDATION_ERROR', 'Choose a stronger password.', { fieldErrors: { password: check.checks.find((c) => !c.pass)!.message } });
    const h = hash(password);
    db().credentials[m.id] = { ...h, setAt: nowIso() };
  };

  // ---- MA-01 ------------------------------------------------------------------------------------
  api.post('/auth/member-login', async (c) => {
    const { login = '', password = '' } = await c.req.json<{ login?: string; password?: string }>().catch(() => ({}) as { login?: string; password?: string });
    const fieldErrors: Record<string, string> = {};
    if (!login.trim()) fieldErrors.login = 'Enter your General No. or Employee ID';
    if (!password) fieldErrors.password = 'Enter your password';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please fill both fields.', { fieldErrors });
    const m = findMember(db(), login);
    if (!m) fail('VALIDATION_ERROR', 'No member with this General No. or Employee ID.', { fieldErrors: { login: 'Not found. Check the number or contact the society office.' } });
    if (m!.status !== 'ACTIVE') fail('FORBIDDEN', 'This membership is not active. Contact the society office.');
    if (!m!.portalActivated) fail('RULE_VIOLATION', 'You have not activated the app yet. Activate it with your Employee ID and registered mobile.', { ruleId: 'NOT_ACTIVATED' });
    if (!passwordMatches(db(), m!.id, password)) fail('VALIDATION_ERROR', 'That password is not right.', { fieldErrors: { password: 'Wrong password. Try again or use Forgot password.' } });
    const s = sessionFor(db(), m!);
    store.save();
    return c.json<Session>(s);
  });

  // ---- MA-02 / MA-03 ----------------------------------------------------------------------------
  api.post('/auth/activate/start', async (c) => {
    const { employeeId = '', mobile = '' } = await c.req.json<{ employeeId?: string; mobile?: string }>().catch(() => ({}) as { employeeId?: string; mobile?: string });
    const fieldErrors: Record<string, string> = {};
    if (!employeeId.trim()) fieldErrors.employeeId = 'Enter your Employee ID or General No.';
    if (!/^[6-9]\d{9}$/.test(mobile)) fieldErrors.mobile = 'Enter your 10-digit registered mobile';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const m = findMember(db(), employeeId);
    if (!m || m.status !== 'ACTIVE') fail('VALIDATION_ERROR', 'Not found in the Member Master.', { fieldErrors: { employeeId: 'Not found in the Member Master. Contact the society office.' } });
    if (m!.mobile !== mobile) fail('VALIDATION_ERROR', 'This mobile is not the one registered with the society.', { fieldErrors: { mobile: `Does not match the registered mobile (${masked(m!.mobile)}). Contact the office to update it.` } });
    if (m!.portalActivated) fail('RULE_VIOLATION', 'Your account is already activated. Sign in, or reset your password.', { ruleId: 'ALREADY_ACTIVE' });
    return c.json<AccountOtp>(challenge(m!, 'activate'));
  });

  api.post('/auth/forgot/start', async (c) => {
    const { login = '' } = await c.req.json<{ login?: string }>().catch(() => ({}) as { login?: string });
    const m = findMember(db(), login);
    if (!m || m.status !== 'ACTIVE') fail('VALIDATION_ERROR', 'No member with this General No. or Employee ID.', { fieldErrors: { login: 'Not found. Check the number or contact the society office.' } });
    if (!m!.portalActivated) fail('RULE_VIOLATION', 'You have not activated the app yet. Activate it first.', { ruleId: 'NOT_ACTIVATED' });
    return c.json<AccountOtp>(challenge(m!, 'reset'));
  });

  api.post('/auth/otp/verify', async (c) => {
    const { otpRef = '', otp = '' } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = otps.get(otpRef);
    if (!pending || Date.now() > pending.expiresAt) fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef);
    const passwordToken = randomUUID();
    tokens.set(passwordToken, { memberId: pending!.memberId, purpose: pending!.purpose, expiresAt: Date.now() + TOKEN_TTL * 1000 });
    return c.json<PasswordToken>({ passwordToken, expiresInSeconds: TOKEN_TTL });
  });

  /** Sets the password. Activation signs the member in (→ MB-01); a reset signs out every session (→ login). */
  api.post('/auth/password/set', async (c) => {
    const { passwordToken = '', password = '' } = await c.req.json<{ passwordToken?: string; password?: string }>().catch(() => ({}) as { passwordToken?: string; password?: string });
    const t = tokens.get(passwordToken);
    if (!t || Date.now() > t.expiresAt) fail('VALIDATION_ERROR', 'This step has expired. Start again.', { fieldErrors: { passwordToken: 'Expired' } });
    const m = db().members.find((x) => x.id === t!.memberId)!;
    setPassword(m, password);
    tokens.delete(passwordToken);
    for (const [k, s] of Object.entries(db().sessions)) if (s.memberId === m.id) delete db().sessions[k];
    if (t!.purpose === 'activate') {
      m.portalActivated = true;
      const s = sessionFor(db(), m);
      audit(store, s.user, 'member', m.id, 'activate', `${m.name} activated the member app`);
      store.save();
      return c.json<{ activated: true; session: Session }>({ activated: true, session: s });
    }
    audit(store, { id: m.id, name: m.name, role: 'MEMBER' }, 'member', m.id, 'resetPassword', `${m.name} reset the app password`);
    store.save();
    return c.json<{ activated: false }>({ activated: false });
  });

  api.post('/auth/password/check', async (c) => {
    const { password = '', login } = await c.req.json<{ password?: string; login?: string }>().catch(() => ({}) as { password?: string; login?: string });
    const m = login ? findMember(db(), login) : undefined;
    return c.json<PasswordCheck>(checkPassword(password, m ? { generalNo: m.generalNo, employeeId: m.employeeId, mobile: m.mobile } : {}));
  });

  // ---- MB-17 --------------------------------------------------------------------------------------
  api.post('/me/password', requireSession, async (c) => {
    const user = c.get('session');
    const m = me(user);
    const { current = '', next = '' } = await c.req.json<{ current?: string; next?: string }>().catch(() => ({}) as { current?: string; next?: string });
    if (!passwordMatches(db(), m.id, current)) fail('VALIDATION_ERROR', 'Your current password is not right.', { fieldErrors: { current: 'Wrong password' } });
    if (current === next) fail('VALIDATION_ERROR', 'Choose a new password.', { fieldErrors: { password: 'Must be different from the current one' } });
    setPassword(m, next);
    const token = c.get('token');
    let signedOut = 0;
    for (const [k, s] of Object.entries(db().sessions))
      if (s.memberId === m.id && k !== token) {
        delete db().sessions[k];
        signedOut++;
      }
    audit(store, user, 'member', m.id, 'changePassword', `${m.name} changed the app password`);
    store.save();
    return c.json({ ok: true as const, signedOutOtherSessions: signedOut });
  });

  const prefsOf = (m: Member): MemberPreferences => db().preferences[m.id] ?? { channels: { SMS: true, WHATSAPP: false, EMAIL: Boolean(m.email) }, language: 'en', ...(m.email ? { email: m.email } : {}) };

  // ---- MB-01 / MB-12 / MB-13 / MB-14 --------------------------------------------------------------
  api.get('/me/home', requireSession, (c) => c.json<MemberHome>(homeFor(db(), me(c.get('session')))));

  api.get('/me/notifications', requireSession, (c) => {
    const m = me(c.get('session'));
    const mine = db().notifications.filter((n) => n.recipientId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Simulated delivery: every in-app message is also "sent" on the channels the member switched on (MB-14).
    const on = (['SMS', 'WHATSAPP', 'EMAIL'] as const).filter((ch) => prefsOf(m).channels[ch]);
    return c.json<MyNotifications>({ items: mine.slice(0, 100).map((n) => ({ ...n, alsoSentVia: n.id.startsWith('ntf-msg-') ? ((n as { alsoSentVia?: typeof on }).alsoSentVia ?? []) : [...on] })), unread: mine.filter((n) => !n.read).length });
  });
  api.post('/me/notifications/read-all', requireSession, (c) => {
    const m = me(c.get('session'));
    for (const n of db().notifications) if (n.recipientId === m.id) n.read = true;
    store.save();
    return c.json({ ok: true as const });
  });
  api.post('/me/notifications/:id/read', requireSession, (c) => {
    const m = me(c.get('session'));
    const n = db().notifications.find((x) => x.id === c.req.param('id') && x.recipientId === m.id) ?? fail('NOT_FOUND', 'Notification not found.');
    n.read = true;
    store.save();
    return c.json({ ok: true as const });
  });

  api.get('/me/preferences', requireSession, (c) => c.json<MemberPreferences>(prefsOf(me(c.get('session')))));
  api.put('/me/preferences', requireSession, async (c) => {
    const m = me(c.get('session'));
    const body = await c.req.json<Partial<MemberPreferences>>().catch(() => ({}) as Partial<MemberPreferences>);
    const next: MemberPreferences = { ...prefsOf(m), ...(body.channels ? { channels: { ...prefsOf(m).channels, ...body.channels } } : {}), language: 'en' };
    if (next.channels.EMAIL && !m.email) fail('VALIDATION_ERROR', 'Add an email to your profile first.', { fieldErrors: { EMAIL: 'No email on your profile. Add one from Profile → Edit.' } });
    db().preferences[m.id] = next;
    store.save();
    return c.json<MemberPreferences>(next);
  });

  api.get('/me/support', requireSession, (c) => {
    const m = me(c.get('session'));
    return c.json<SupportCenter>({ office: OFFICE, faqs: FAQS, tickets: db().supportTickets.filter((t) => t.memberId === m.id).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)) });
  });
  api.post('/me/support/tickets', requireSession, async (c) => {
    const user = c.get('session');
    const m = me(user);
    const { subject = '', message = '', category: asked } = await c.req.json<{ subject?: string; message?: string; category?: SupportTicket['category'] }>().catch(() => ({}) as { subject?: string; message?: string; category?: SupportTicket['category'] });
    const category = TICKET_CATEGORIES.includes(asked!) ? asked! : 'OTHER';
    const fieldErrors: Record<string, string> = {};
    if (subject.trim().length < 5) fieldErrors.subject = 'Add a short subject (at least 5 characters)';
    if (message.trim().length < 10) fieldErrors.message = 'Tell us a little more (at least 10 characters)';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const at = nowIso();
    const t: SupportTicket = {
      id: `tkt-${db().supportTickets.length + 1}-${Date.now().toString(36)}`,
      memberId: m.id,
      subject: subject.trim(),
      status: 'OPEN',
      createdAt: at,
      updatedAt: at,
      category,
      messages: [
        { from: 'MEMBER', byName: m.name, at, text: message.trim() },
        { from: 'OFFICE', byName: 'Society office (auto-reply)', at, text: 'Thank you. We have received your query and will reply within two working days.' },
      ],
    };
    db().supportTickets.push(t);
    audit(store, user, 'ticket', t.id, 'create', `${m.name}: ${t.subject}`);
    store.save();
    return c.json<SupportTicket>(t, 201);
  });

  // ---- demo helper --------------------------------------------------------------------------------
  api.get('/__demo/activation-sample', (c) => {
    const m = [...db().members].filter((x) => x.status === 'ACTIVE' && !x.portalActivated).sort((a, b) => a.generalNo.localeCompare(b.generalNo))[0];
    if (!m) return fail('NOT_FOUND', 'Every member has activated the app.');
    return c.json<ActivationSample>({ name: m.name, generalNo: m.generalNo, employeeId: m.employeeId, mobile: m.mobile });
  });
}
