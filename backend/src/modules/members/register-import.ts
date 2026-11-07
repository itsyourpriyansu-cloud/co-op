import { maskMobile, toPaise, validateMemberInput, type JournalLineInput } from '@tgs/domain';
import type { Member, MemberInput, RecoveryMandate, ServiceEvent } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { parseCsv } from '../../common/utils/csv';
import { withTransaction } from '../../db/transaction';
import { ACCOUNT } from '../ledger/ledger.accounts';

// P9 (D-100, F-11): bring the society's member register into the books at go-live. One CSV row per
// member (template: backend/import/members-register-template.csv, amounts in rupees). Every row is
// checked first; nothing is written unless all rows pass. Each member gets their record, an agreed
// recovery mandate (the paper F5 is on file), a JOINED event, an app account, a share account and one
// OPENING journal entry (share capital + share deposit against 3900 Opening balance difference).
// shortcut: members and shares only; loan and deposit registers follow once the society sends samples (F-11).

export const REGISTER_COLUMNS = [
  'generalNo', 'employeeId', 'name', 'fatherName', 'gender', 'caste', 'dob', 'mobile', 'email', 'designation', 'department',
  'doj', 'dor', 'employmentType', 'numberOfShares', 'joinedSocietyOn', 'addressLine1', 'city', 'district', 'pincode',
  'nomineeName', 'nomineeRelation', 'scaleOfPay', 'substantivePay', 'grossSalary', 'govtLoanDeductions', 'otherLoanDeductions',
  'shareCapital', 'shareDepositBalance',
] as const;

export interface RegisterImportResult {
  rows: number;
  committed: boolean;
  /** Row number as in the spreadsheet (header = row 1) → field → problem. */
  errors: Array<{ row: number; generalNo: string; fieldErrors: Record<string, string> }>;
  /** Paise. */
  shareCapital: number;
  shareDeposit: number;
}

const rupees = (v: string | undefined) => (v?.trim() ? toPaise(Number(v.replace(/,/g, ''))) : NaN);
const isDate = (v: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');

export async function importMemberRegister(
  app: FastifyInstance,
  csv: string,
  opts: { commit: boolean; asOn: string; actor: { id: string; name: string } },
): Promise<RegisterImportResult> {
  if (!isDate(opts.asOn)) throw new Error('The as-on date must be YYYY-MM-DD.');
  const rows = parseCsv(csv);
  const result: RegisterImportResult = { rows: rows.length, committed: false, errors: [], shareCapital: 0, shareDeposit: 0 };
  const missing = REGISTER_COLUMNS.filter((c) => rows[0] && !(c in rows[0]));
  if (!rows.length || missing.length) {
    result.errors.push({ row: 1, generalNo: '', fieldErrors: { header: rows.length ? `Missing columns: ${missing.join(', ')}` : 'The file has no member rows.' } });
    return result;
  }

  const [settings, depts, existing] = await Promise.all([app.masters.settings(), app.departments.all(), app.members.repo.others()]);
  const others: Array<Pick<Member, 'id' | 'employeeId' | 'mobile' | 'name' | 'generalNo'>> = [...existing];
  const generalNos = new Set(existing.map((m) => m.generalNo));
  const parsed: Array<{ member: Member; capital: number; deposit: number; ddo: string }> = [];

  rows.forEach((r, i) => {
    const address = { line1: r.addressLine1 ?? '', city: r.city ?? '', district: r.district ?? '', pincode: r.pincode ?? '' };
    const dept = depts.find((d) => d.id === r.department || d.code.toLowerCase() === (r.department ?? '').toLowerCase());
    const input: Partial<MemberInput> = {
      name: r.name, fatherName: r.fatherName, gender: r.gender as MemberInput['gender'], caste: r.caste, dob: r.dob, mobile: r.mobile,
      ...(r.email ? { email: r.email } : {}),
      // shortcut: one address for present and permanent; a register with two addresses adds permanent* columns.
      presentAddress: address, permanentAddress: address,
      employeeId: r.employeeId, departmentId: dept?.id ?? '', designation: r.designation, doj: r.doj, dor: r.dor,
      employmentType: r.employmentType as MemberInput['employmentType'], numberOfShares: Number(r.numberOfShares),
      nominee: { name: r.nomineeName ?? '', relation: r.nomineeRelation as Member['nominee']['relation'] },
      payProfile: { scaleOfPay: r.scaleOfPay ?? '', substantivePay: rupees(r.substantivePay), grossSalary: rupees(r.grossSalary), govtLoanDeductions: rupees(r.govtLoanDeductions || '0'), otherLoanDeductions: rupees(r.otherLoanDeductions || '0') },
    };
    const e = validateMemberInput(input, { today: opts.asOn, minShares: settings.minShares, maxShares: settings.maxShares, others, casteCategories: settings.casteCategories });
    // Registers from before F-07 have no caste; the office adds it later on the member's profile.
    if (!r.caste) delete e.caste;
    if (!dept) e.department = `Unknown department "${r.department ?? ''}" (use its id or code)`;
    if (!/^\d+$/.test(r.generalNo ?? '')) e.generalNo = 'General No. must be a number';
    else if (generalNos.has(r.generalNo!)) e.generalNo = 'General No. already used';
    if (!isDate(r.joinedSocietyOn) || r.joinedSocietyOn! > opts.asOn) e.joinedSocietyOn = 'Date joined as YYYY-MM-DD, not after the as-on date';
    if (!(rupees(r.substantivePay) >= 0)) e.substantivePay = 'Enter an amount in rupees';
    if (!(rupees(r.grossSalary) >= 0)) e.grossSalary = 'Enter an amount in rupees';
    const capital = rupees(r.shareCapital);
    const deposit = rupees(r.shareDepositBalance || '0');
    const expected = Number(r.numberOfShares) * settings.shareValue;
    if (!(capital >= 0)) e.shareCapital = 'Enter an amount in rupees';
    else if (capital !== expected) e.shareCapital = `Should be shares × share value (₹${expected / 100})`;
    if (!(deposit >= 0)) e.shareDepositBalance = 'Enter an amount in rupees';

    if (Object.keys(e).length) {
      result.errors.push({ row: i + 2, generalNo: r.generalNo ?? '', fieldErrors: e });
      return;
    }
    const v = input as MemberInput;
    const member: Member = {
      id: `mem-${r.generalNo}`,
      generalNo: r.generalNo!,
      employeeId: v.employeeId.trim(),
      name: v.name.trim(),
      fatherName: v.fatherName.trim(),
      gender: v.gender,
      ...(r.caste ? { caste: r.caste } : {}),
      dob: v.dob,
      mobile: v.mobile,
      mobileMasked: maskMobile(v.mobile),
      ...(v.email ? { email: v.email } : {}),
      presentAddress: v.presentAddress,
      permanentAddress: v.permanentAddress,
      designation: v.designation,
      departmentId: v.departmentId,
      doj: v.doj,
      dor: v.dor,
      employmentType: v.employmentType,
      numberOfShares: v.numberOfShares,
      nominee: v.nominee,
      payProfile: { ...v.payProfile, certifiedAt: opts.asOn },
      status: 'ACTIVE',
      portalActivated: false,
      joinedSocietyOn: r.joinedSocietyOn!,
    };
    others.push(member);
    generalNos.add(member.generalNo);
    parsed.push({ member, capital, deposit, ddo: dept!.ddoName });
    result.shareCapital += capital;
    result.shareDeposit += deposit;
  });
  if (result.errors.length || !opts.commit) return result;

  await withTransaction(app.db, async (tx) => {
    for (const { member: m, capital, deposit, ddo } of parsed) {
      const mandate: RecoveryMandate = { id: `mdt-${m.generalNo}-1`, memberId: m.id, departmentId: m.departmentId, status: 'AGREED', signedOn: m.joinedSocietyOn, agreedOn: m.joinedSocietyOn, agreedByName: ddo };
      const event: ServiceEvent = { id: `sev-imp-${m.generalNo}`, memberId: m.id, type: 'JOINED', date: m.joinedSocietyOn, summary: `Joined the society (General No. ${m.generalNo}); brought in from the register`, byName: opts.actor.name };
      await app.members.repo.insert(tx, m);
      await app.members.repo.insertMandate(tx, mandate);
      await app.members.repo.addEvent(tx, event);
      await app.appAccounts.upsertMember(tx, { id: m.id, generalNo: m.generalNo, employeeId: m.employeeId, name: m.name, mobile: m.mobile, active: true });
      await app.collections.repo.saveShare(tx, { memberId: m.id, numberOfShares: m.numberOfShares, shareCapital: capital, shareDepositBalance: deposit });
      const lines: JournalLineInput[] = [
        { accountCode: ACCOUNT.SHARE_CAPITAL, debit: 0, credit: capital, memberId: m.id, refType: 'SHARE', refId: m.id },
        { accountCode: ACCOUNT.SHARE_DEPOSIT, debit: 0, credit: deposit, memberId: m.id, refType: 'SHARE', refId: m.id },
      ].filter((l) => l.credit > 0);
      if (lines.length) {
        lines.push({ accountCode: ACCOUNT.OPENING_DIFFERENCE, debit: capital + deposit, credit: 0 });
        await app.ledger.post({ entryDate: opts.asOn, narration: `Opening balances brought forward (${m.id})`, source: 'OPENING', sourceRef: m.id, lines, postedBy: opts.actor }, tx);
      }
    }
    await app.audit.record(undefined, { action: 'members.import', entity: 'member', summary: `Imported ${parsed.length} members from the register (as on ${opts.asOn})`, after: { rows: parsed.length, shareCapital: result.shareCapital, shareDeposit: result.shareDeposit }, actor: opts.actor }, tx);
  });
  result.committed = true;
  return result;
}
