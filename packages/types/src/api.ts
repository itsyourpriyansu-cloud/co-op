// API envelope types shared by the mock API and both clients (docs/11-api-contracts.md).
import type { Channel, Permission, Role } from './roles';
import type { ISODate } from './entities';

export const API_PREFIX = '/api/v1';

export type ServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ALREADY_EXISTS'
  | 'ALREADY_POSTED'
  | 'RULE_VIOLATION'
  | 'NETWORK';

export interface ServiceErrorBody {
  code: ServiceErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  ruleId?: string;
}

export const ERROR_STATUS: Record<ServiceErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  ALREADY_EXISTS: 409,
  ALREADY_POSTED: 409,
  RULE_VIOLATION: 422,
  NETWORK: 503,
};

export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  filters?: Record<string, string | string[]>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Staff only: department scope for DDOs. */
  departmentId?: string;
  /** Members only. */
  memberId?: string;
  generalNo?: string;
}

export interface Session {
  token: string;
  user: SessionUser;
}

export interface Me {
  user: SessionUser;
  channel: Channel;
  permissions: Permission[];
}

/** Demo personas offered on the login screens (docs/13 §2). */
export interface Persona {
  id: string;
  name: string;
  role: Role;
  channel: Channel;
  /** What this persona lets you demo. */
  story: string;
}

export interface DemoState {
  today: ISODate;
  failureRate: number;
  latencyMs: [number, number];
  seedVersion: number;
}

export interface Health {
  ok: true;
  service: 'tgseccsl-mock-api';
  version: string;
  today: ISODate;
}
