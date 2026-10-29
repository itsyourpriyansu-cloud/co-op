import { ERROR_STATUS, type ServiceErrorBody, type ServiceErrorCode } from '@tgs/types';

/**
 * Throw from any layer; the error-handler plugin turns it into the documented JSON body
 * `{ code, message, fieldErrors?, ruleId? }` with the status from docs/11 §1.
 * Same contract as the mock API's ServiceError, so the apps handle both alike.
 */
export class AppError extends Error {
  readonly body: ServiceErrorBody;
  readonly status: number;

  constructor(code: ServiceErrorCode, message: string, extra: Omit<ServiceErrorBody, 'code' | 'message'> = {}) {
    super(message);
    this.name = 'AppError';
    this.body = { code, message, ...extra };
    this.status = ERROR_STATUS[code];
  }
}

export function fail(code: ServiceErrorCode, message: string, extra?: Omit<ServiceErrorBody, 'code' | 'message'>): never {
  throw new AppError(code, message, extra);
}
