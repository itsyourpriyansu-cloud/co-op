import { ERROR_STATUS, type ServiceErrorBody, type ServiceErrorCode } from '@tgs/types';

/** Throw anywhere in a route; the app-level error handler turns it into the documented JSON body. */
export class ServiceError extends Error {
  readonly body: ServiceErrorBody;
  readonly status: number;

  constructor(
    code: ServiceErrorCode,
    message: string,
    extra: Omit<ServiceErrorBody, 'code' | 'message'> = {},
  ) {
    super(message);
    this.body = { code, message, ...extra };
    this.status = ERROR_STATUS[code];
  }
}

export function fail(
  code: ServiceErrorCode,
  message: string,
  extra?: Omit<ServiceErrorBody, 'code' | 'message'>,
): never {
  throw new ServiceError(code, message, extra);
}
