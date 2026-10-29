export const SERVICE_NAME = 'tgseccsl-backend' as const;
export const APP_VERSION = '0.1.0';

/** Versioned API prefix, same as the mock API (docs/11 §1). `/health` stays unversioned. */
export const API_PREFIX = '/api/v1';

/** Society time zone: business dates are India dates (docs/07, D-065). */
export const TIME_ZONE = 'Asia/Kolkata';
