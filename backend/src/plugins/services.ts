import fp from 'fastify-plugin';
import { AppAccountsService } from '../modules/auth/app-accounts.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import { DepartmentsRepository } from '../modules/departments/departments.repository';
import { DepartmentsService } from '../modules/departments/departments.service';
import { LedgerRepository } from '../modules/ledger/ledger.repository';
import { LedgerService } from '../modules/ledger/ledger.service';
import { MastersRepository } from '../modules/masters/masters.repository';
import { MembersImport } from '../modules/members/members.import';
import { MembersRepository } from '../modules/members/members.repository';
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
    membersImport: MembersImport;
  }
}

/** Services other modules call (a service may call another module's service, docs/22 §2). */
export const servicesPlugin = fp(
  async (app) => {
    app.decorate('masters', new MastersService(app, new MastersRepository(app.db)));
    app.decorate('ledger', new LedgerService(app, new LedgerRepository(app.db)));
    app.decorate('departments', new DepartmentsService(app, new DepartmentsRepository(app.db)));
    app.decorate('appAccounts', new AppAccountsService(new AuthRepository(app.db)));
    app.decorate('membersImport', new MembersImport(app, new MembersRepository(app.db)));
  },
  { name: 'services', dependencies: ['db', 'auth'] },
);
