import { LoanWorkflowService } from '../modules/loans/loan-workflow.service';
import { LoansRepository } from '../modules/loans/loans.repository';
import { LoansService } from '../modules/loans/loans.service';
import { JoiningRepository } from '../modules/joining/joining.repository';
import { JoiningService } from '../modules/joining/joining.service';
import fp from 'fastify-plugin';
import { AppAccountsService } from '../modules/auth/app-accounts.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import { DepartmentsRepository } from '../modules/departments/departments.repository';
import { DepartmentsService } from '../modules/departments/departments.service';
import { LedgerRepository } from '../modules/ledger/ledger.repository';
import { LedgerService } from '../modules/ledger/ledger.service';
import { MastersRepository } from '../modules/masters/masters.repository';
import { MembersRepository } from '../modules/members/members.repository';
import { MembersService } from '../modules/members/members.service';
import { ProfileChangesRepository } from '../modules/profile-changes/profile-changes.repository';
import { ProfileChangesService } from '../modules/profile-changes/profile-changes.service';
import { MastersService } from '../modules/masters/masters.service';

declare module 'fastify' {
  interface FastifyInstance {
    /** Active settings and loan products for every module (P2; loans, deposits and demand read them). */
    masters: MastersService;
    /** The books: every module posts its money movements through it (P3, REQ-131). */
    ledger: LedgerService;
    departments: DepartmentsService;
    /** Member App sign-in accounts, kept in step with members (P4). */
    appAccounts: AppAccountsService;
    /** Dev only until P4c: import members the mock's joining flow created. */
    joining: JoiningService;
    loans: LoansService;
    loanWorkflow: LoanWorkflowService;
    members: MembersService;
    profileChanges: ProfileChangesService;
  }
}

/** Services other modules call (a service may call another module's service, docs/22 §2). */
export const servicesPlugin = fp(
  async (app) => {
    app.decorate('masters', new MastersService(app, new MastersRepository(app.db)));
    app.decorate('ledger', new LedgerService(app, new LedgerRepository(app.db)));
    app.decorate('departments', new DepartmentsService(app, new DepartmentsRepository(app.db)));
    app.decorate('appAccounts', new AppAccountsService(app, new AuthRepository(app.db)));
    app.decorate('members', new MembersService(app, new MembersRepository(app.db)));
    app.decorate('profileChanges', new ProfileChangesService(app, new ProfileChangesRepository(app.db)));
    app.decorate('joining', new JoiningService(app, new JoiningRepository(app.db)));
    const loans = new LoansService(app, new LoansRepository(app.db));
    app.decorate('loans', loans);
    app.decorate('loanWorkflow', new LoanWorkflowService(app, loans));
  },
  { name: 'services', dependencies: ['db', 'auth'] },
);
