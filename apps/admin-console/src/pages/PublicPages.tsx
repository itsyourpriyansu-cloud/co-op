// G4 (D-114): public pages the app stores link to (no sign-in). Wording is a proposal [P] for the
// society's managing committee to approve before the store listing (docs/store-release.md).
import type { ReactNode } from 'react';
import { brand } from '@tgs/design-tokens';
import { AppMark } from '@/components/AppMark';

const SOCIETY = 'The Telangana Secretariat Employees Co-operative Credit Society Ltd. (Regd. No. P-929)';
const ADDRESS = '2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004';
const UPDATED = '12 Nov 2026';

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-full bg-canvas px-4 py-10">
      <article className="mx-auto flex max-w-3xl flex-col gap-6 text-body text-fg">
        <header className="flex items-center gap-3">
          <AppMark size={40} />
          <span className="text-card-title">{brand.appName}</span>
        </header>
        <div>
          <h1 className="text-page-title">{title}</h1>
          <p className="mt-1 text-caption text-fg-tertiary">
            {SOCIETY} · Last updated {UPDATED}
          </p>
        </div>
        {children}
      </article>
    </main>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-section-title">{title}</h2>
      {children}
    </section>
  );
}

/** Store listing "Privacy policy" link: /privacy */
export function PrivacyPage() {
  return (
    <Page title="Privacy notice">
      <p>Version PN-2026.1, the one you consent to when you apply for membership. This notice covers the TGSECCSL member app, the staff screens in it and the society's admin console. The society decides why and how your personal data is used.</p>
      <Part title="What we hold">
        <ul className="list-disc pl-6">
          <li>Who you are: name, father's or husband's name, date of birth, caste category, photo, address, mobile number and email.</li>
          <li>Your service: employee ID, department, designation, pay details and date of retirement, used for loan limits and salary recovery.</li>
          <li>Your money with the society: shares, deposits, loans, sureties, payments and receipts.</li>
          <li>What you sign or upload: signatures, nominee details, ID proofs and other documents.</li>
          <li>Your use of the app: sign-in times, the phone that receives your notifications, and a record of changes made to your account.</li>
        </ul>
      </Part>
      <Part title="Why we use it">
        <p>To admit you as a member, give loans and accept deposits, recover dues through your pay office, send you notices, keep the books and meet the audit and co-operative society rules. We do not sell your data and show no advertising.</p>
      </Part>
      <Part title="Who sees it">
        <ul className="list-disc pl-6">
          <li>Society staff, each seeing only what their role needs.</li>
          <li>Your department's Drawing &amp; Disbursing Officer, for the deductions they make from your salary.</li>
          <li>Services that run the system for us: Microsoft Azure (servers in India), WhatsApp and email for messages, and Google and Apple to deliver notifications to your phone.</li>
          <li>Auditors and authorities, when the law requires it.</li>
        </ul>
      </Part>
      <Part title="How it is protected">
        <p>Data travels encrypted. Signatures, documents and sign-in secrets are encrypted again when stored. Staff sign in with a password and an authenticator code, and every change is recorded.</p>
      </Part>
      <Part title="How long we keep it">
        <p>For as long as you are a member, and afterwards for as long as the society's accounts and the law require. If your membership application is rejected or you withdraw it, the application, its documents and your app sign-in are deleted automatically after the period the society sets (12 months unless changed). App-only data (your app sign-in, notification settings and phones) is removed when you ask us to delete your account.</p>
      </Part>
      <Part title="Your choices">
        <p>You can see your data in the app, ask for a correction (Profile → Request a change), choose how messages reach you (Settings), withdraw your consent, ask for your app account to be deleted (<a className="text-brand-text underline" href="/account-deletion">how</a>), and complain to us first. If we do not resolve it, you may approach the Data Protection Board of India.</p>
      </Part>
      <Part title="Contact">
        <p>The Secretary, {SOCIETY}, {ADDRESS}. In the app: More → Help → Ask a question.</p>
      </Part>
    </Page>
  );
}

/** Store listing "Delete account" link: /account-deletion */
export function AccountDeletionPage() {
  return (
    <Page title="Delete your app account">
      <Part title="In the app">
        <ol className="list-decimal pl-6">
          <li>Open the TGSECCSL app and sign in.</li>
          <li>Go to More → Settings → Delete my account.</li>
          <li>Send the request. The office replies under Help within two working days.</li>
        </ol>
      </Part>
      <Part title="Without the app">
        <p>Write to, or visit, the Secretary at {ADDRESS}, with your name, General No. and registered mobile number.</p>
      </Part>
      <Part title="What is deleted">
        <p>Your app sign-in, the phones that receive your notifications, your message settings, and uploaded files the society does not have to keep. This is done within 30 days of the request.</p>
      </Part>
      <Part title="What the society keeps">
        <p>Membership, loan, deposit, share and payment records, with the forms you signed. A co-operative credit society must keep these for its audits and under the law, for as long as those rules require. Leaving the society itself is done at the office.</p>
      </Part>
    </Page>
  );
}
