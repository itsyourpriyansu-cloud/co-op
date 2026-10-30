import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { MembersService } from '../members/members.service';
import type { ProfileChangesService } from './profile-changes.service';

type Decision = FastifyRequest<{ Params: { id: string }; Body: { approve?: boolean; remarks?: string } }>;

export class ProfileChangesController {
  constructor(
    private readonly service: ProfileChangesService,
    private readonly members: MembersService,
  ) {}

  list = (r: FastifyRequest) => this.service.list(sessionOf(r));
  certify = (r: Decision) => this.service.certify(r, r.params.id, r.body);
  decide = (r: Decision) => this.service.decide(r, r.params.id, r.body);
  myProfile = (r: FastifyRequest) => this.members.myProfile(sessionOf(r));
  mine = (r: FastifyRequest) => this.service.mine(sessionOf(r));
}
