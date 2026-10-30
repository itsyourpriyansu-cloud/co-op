import type { LoanProduct, LoanProductCode, NotificationTemplate, SocietyProfile } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { MastersService, SettingsPatch } from './masters.service';

type Req<B = unknown, P = unknown> = FastifyRequest<{ Body: B; Params: P }>;

export class MastersController {
  constructor(private readonly service: MastersService) {}

  bundle = (r: FastifyRequest) => this.service.bundle(sessionOf(r));
  updateSociety = (r: Req<Partial<SocietyProfile>>) => this.service.updateSociety(r, r.body);
  updateSettings = (r: Req<SettingsPatch>) => this.service.updateSettings(r, r.body);
  updateProduct = (r: Req<Partial<LoanProduct>, { code: LoanProductCode }>) => this.service.updateLoanProduct(r, r.params.code, r.body);
  settingsVersions = () => this.service.settingsVersions();
  productVersions = (r: Req<unknown, { code: LoanProductCode }>) => this.service.productVersions(r.params.code);
  templates = () => this.service.templates();
  updateTemplate = (r: Req<Partial<NotificationTemplate>, { key: string }>) => this.service.updateTemplate(r, r.params.key, r.body);
  rates = () => this.service.rates();
}
