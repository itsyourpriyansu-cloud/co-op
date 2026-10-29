// @tgs/api-client: the single way both apps talk to the API (docs/11).
// Swapping the mock API for the production backend should only change `baseUrl`.
import {
  API_PREFIX,
  type Channel,
  type DemoState,
  type Health,
  type ISODate,
  type Me,
  type DashboardSummary,
  type DatasetSample,
  type JoiningReference,
  type MembershipAction,
  type MembershipActionInput,
  type MembershipApplication,
  type MembershipDetail,
  type MembershipForm,
  type MembershipList,
  type DepartmentRow,
  type Department,
  type LoanProduct,
  type LoanProductCode,
  type NotificationTemplate,
  type PermissionMatrix,
  type RatesReference,
  type SettingsBundle,
  type SocietyProfile,
  type SocietySettings,
  type StaffUser,
  type StaffLoginResult,
  type TotpSetup,
  type OtpStarted,
  type OtpChallenge,
  type DatasetSummary,
  type Persona,
  type Scenario,
  type ServiceErrorBody,
  type ServiceErrorCode,
  type Session,
  type ChangeRequestInput,
  type ChangeRequestList,
  type ChangeRequestRow,
  type ContactUpdateInput,
  type MemberDetail,
  type MemberInput,
  type MemberList,
  type MemberListParams,
  type MyProfile,
  type ProfileChangeRequest,
  type TransferInput,
  type LoanAssessment,
  type LoanContext,
  type LoanDetail,
  type LoanList,
  type LoanListParams,
  type LoanRequestInput,
  type LoanRow,
  type MemberPick,
  type SuretyCard,
  type LoanActionInput,
  type SanctionPreview,
  type SuretyRequest,
  type SuretyRequests,
  type WorkQueue,
  type DepositActionInput,
  type DepositContext,
  type DepositDetail,
  type DepositList,
  type DepositListParams,
  type DepositRow,
  type FdRequestInput,
  type DemandCycleOverview,
  type DemandPreview,
  type DemandSheetDetail,
  type MemberDues,
  type MyPayments,
  type NewReceiptInput,
  type PaymentReport,
  type PaymentReportRow,
  type ReceiptDetail,
  type ReceiptList,
  type ReceiptListParams,
  type RecoveryInput,
  type ReportPaymentInput,
  type ActivationSample,
  type MemberHome,
  type MemberPreferences,
  type MyNotifications,
  type SupportCenter,
  type SupportTicket,
  type ComposeInput,
  type ComposePreview,
  type DefaulterNotice,
  type OutboxMessage,
  type ReportDef,
  type ReportFilterKey,
  type ReportOptions,
  type ReportResult,
  type RoleDashboard,
  type StaffNotifications,
  type StaffTicketRow,
  type SearchHit,
} from '@tgs/types';

export class ApiError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly ruleId?: string;

  constructor(status: number, body: ServiceErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors;
    this.ruleId = body.ruleId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export interface ApiClientOptions {
  /** Server root, e.g. http://localhost:4000 (no trailing slash needed). May change at runtime (MA-05). */
  baseUrl: string | (() => string | Promise<string>);
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Called on 401 so the app can drop its session. */
  onUnauthenticated?: () => void;
  /**
   * Backend only (docs/22 §5.1): on a 401, try to renew the access token once and retry.
   * Resolve true when a new token is stored (getToken then returns it), false to give up.
   */
  refreshSession?: () => Promise<boolean>;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function createApiClient(options: ApiClientOptions) {
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function resolveBase(): Promise<string> {
    const raw = typeof options.baseUrl === 'function' ? await options.baseUrl() : options.baseUrl;
    return raw.replace(/\/+$/, '');
  }

  // One renewal at a time: parallel 401s wait for the same refresh.
  let refreshing: Promise<boolean> | null = null;
  function refreshOnce(): Promise<boolean> {
    refreshing ??= (options.refreshSession?.() ?? Promise.resolve(false)).catch(() => false).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(
    method: Method,
    path: string,
    body?: unknown,
    versioned = true,
    retried = false,
  ): Promise<T> {
    const url = (await resolveBase()) + (versioned ? API_PREFIX : '') + path;
    const token = options.getToken ? await options.getToken() : undefined;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    // Manual timeout: AbortSignal.timeout is not available on every JS engine (Hermes).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, {
        code: 'NETWORK',
        message: "Can't reach the society server. Check your connection and try again.",
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const data: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const errorBody = isErrorBody(data)
        ? data
        : { code: 'NETWORK' as const, message: `Unexpected response (${res.status}).` };
      // Sign-in calls answer 401 for a bad step; never renew on those (or on the renewal itself).
      const isAuthCall = path.startsWith('/auth/');
      if (res.status === 401 && !retried && !isAuthCall && options.refreshSession && token) {
        if (await refreshOnce()) return request<T>(method, path, body, versioned, true);
      }
      if (res.status === 401) options.onUnauthenticated?.();
      throw new ApiError(res.status, errorBody);
    }
    return data as T;
  }

  return {
    health: () => request<Health>('GET', '/health', undefined, false),
    me: () => request<Me>('GET', '/me'),
    auth: {
      loginAsPersona: (personaId: string, channel: Channel) =>
        request<Session>('POST', '/auth/persona', { personaId, channel }),
      /** Backend sends the refresh token so the whole sign-in ends; the mock ignores the body. */
      logout: (refreshToken?: string) => request<{ ok: true }>('POST', '/auth/logout', refreshToken ? { refreshToken } : undefined),
      // ---- Backend (docs/22 §5.1) ----
      /** AU-01: staff user ID + password. Signers continue with an authenticator code. */
      staffLogin: (username: string, password: string) => request<StaffLoginResult>('POST', '/auth/staff/login', { username, password }),
      totpSetup: (challengeToken: string) => request<TotpSetup>('POST', '/auth/staff/totp/setup', { challengeToken }),
      totpConfirm: (challengeToken: string, code: string) => request<Session>('POST', '/auth/staff/totp/confirm', { challengeToken, code }),
      totpVerify: (challengeToken: string, code: string) => request<Session>('POST', '/auth/staff/totp', { challengeToken, code }),
      changeStaffPassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('POST', '/auth/staff/password', { currentPassword, newPassword }),
      refresh: (refreshToken: string) => request<Session>('POST', '/auth/refresh', { refreshToken }),
      /** Member App sign-in / sign-up by mobile (D-067). */
      otpStart: (mobile: string, purpose: 'LOGIN' | 'SIGNUP' = 'LOGIN') => request<OtpStarted>('POST', '/auth/otp/start', { mobile, purpose }),
      otpVerify: (otpRef: string, otp: string, name?: string) => request<Session>('POST', '/auth/otp/verify', { otpRef, otp, ...(name ? { name } : {}) }),
    },
    /** Member: account, home, notifications, preferences, support (M8). */
    account: {
      home: () => request<MemberHome>('GET', '/me/home'),
      notifications: () => request<MyNotifications>('GET', '/me/notifications'),
      readNotification: (id: string) => request<{ ok: true }>('POST', `/me/notifications/${id}/read`),
      readAllNotifications: () => request<{ ok: true }>('POST', '/me/notifications/read-all'),
      preferences: () => request<MemberPreferences>('GET', '/me/preferences'),
      savePreferences: (input: Partial<MemberPreferences>) => request<MemberPreferences>('PUT', '/me/preferences', input),
      support: () => request<SupportCenter>('GET', '/me/support'),
      createTicket: (input: { subject: string; message: string; category: NonNullable<SupportTicket['category']> }) => request<SupportTicket>('POST', '/me/support/tickets', input),
    },
    demo: {
      personas: (channel?: Channel) =>
        request<Persona[]>('GET', `/__demo/personas${channel ? `?channel=${channel}` : ''}`),
      state: () => request<DemoState>('GET', '/__demo/state'),
      activationSample: () => request<ActivationSample>('GET', '/__demo/activation-sample'),
      reset: () => request<DemoState>('POST', '/__demo/reset'),
      setClock: (today: ISODate | null) => request<DemoState>('POST', '/__demo/clock', { today }),
      setFailureRate: (rate: number) =>
        request<DemoState>('POST', '/__demo/failure-rate', { rate }),
      scenarios: () => request<Scenario[]>('GET', '/__demo/scenarios'),
      dataset: () => request<DatasetSummary>('GET', '/__demo/dataset'),
      sample: () => request<DatasetSample>('GET', '/__demo/sample'),
      /** Move an application through staff stages until the console screens exist (M3). */
      membership: {
        advance: (id: string) => request<MembershipApplication>('POST', `/__demo/membership/${id}/advance`),
        requestInfo: (id: string) => request<MembershipApplication>('POST', `/__demo/membership/${id}/request-info`, {}),
        reject: (id: string) => request<MembershipApplication>('POST', `/__demo/membership/${id}/reject`),
      },
    },
    dashboard: {
      summary: () => request<DashboardSummary>('GET', '/dashboard/summary'),
      /** ST-01 role variant (M9). */
      role: () => request<RoleDashboard>('GET', '/dashboard/role'),
    },
    /** Topbar global search (M10). */
    search: (q: string) => request<SearchHit[]>('GET', `/search${toQuery({ q })}`),
    /** ST-50 / ST-51 / ST-52 (M9). */
    reports: {
      catalogue: () => request<{ reports: ReportDef[]; options: ReportOptions }>('GET', '/reports'),
      run: (id: string, params: Partial<Record<ReportFilterKey, string>> = {}) => request<ReportResult>('GET', `/reports/${id}${toQuery(params)}`),
      defaulterNotice: (memberId: string) => request<DefaulterNotice>('GET', `/print/defaulter-notice/${memberId}`),
    },
    /** ST-03 staff notifications, composer, member questions (M9). */
    notifications: {
      list: () => request<StaffNotifications>('GET', '/notifications'),
      count: () => request<{ unread: number; openQuestions: number }>('GET', '/notifications/count'),
      read: (id: string) => request<{ ok: true }>('POST', `/notifications/${id}/read`),
      readAll: () => request<{ ok: true }>('POST', '/notifications/read-all'),
      messages: () => request<OutboxMessage[]>('GET', '/messages'),
      preview: (input: ComposeInput) => request<ComposePreview>('POST', '/messages/preview', input),
      send: (input: ComposeInput) => request<OutboxMessage>('POST', '/messages', input),
      tickets: () => request<StaffTicketRow[]>('GET', '/support/tickets'),
      reply: (id: string, text: string, close = false) => request<StaffTicketRow>('POST', `/support/tickets/${id}/reply`, { text, close }),
    },
    /** Joining the society (D-026): public reference. Sign-up is auth.otpStart('SIGNUP') (D-067). */
    joining: {
      reference: () => request<JoiningReference>('GET', '/joining/reference'),
    },
    /** The signed-in applicant's own membership application. */
    membership: {
      me: () => request<MembershipApplication | null>('GET', '/membership/me'),
      eligibility: (answers: { worksInSecretariatDept: boolean; regularOrApprovedProbationer: boolean; memberOfOtherCreditSocietyWithDues: boolean }) =>
        request<{ eligible: boolean; checks: Array<{ ruleId: string; pass: boolean; message: string }>; application: MembershipApplication }>('POST', '/membership/me/eligibility', answers),
      saveDraft: (patch: MembershipForm) => request<MembershipApplication>('PUT', '/membership/me/draft', patch),
      requestSign: () => request<OtpChallenge>('POST', '/membership/me/sign/request'),
      submit: (otpRef: string, otp: string) => request<MembershipApplication>('POST', '/membership/me/submit', { otpRef, otp }),
    },
    /** Staff: membership applications (ST-14 … ST-17). */
    applications: {
      list: () => request<MembershipList>('GET', '/membership/applications'),
      get: (id: string) => request<MembershipDetail>('GET', `/membership/applications/${id}`),
      act: (id: string, action: MembershipAction, input: MembershipActionInput = {}) => request<MembershipDetail>('POST', `/membership/applications/${id}/actions/${action}`, input),
      /** Demo: act for whoever owns the current stage. */
      demoAct: (id: string) => request<MembershipDetail>('POST', `/membership/applications/${id}/demo-act`),
    },
    /** M2 settings & masters (ST-60 … ST-67). */
    settings: {
      get: () => request<SettingsBundle>('GET', '/settings'),
      updateSociety: (p: Partial<SocietyProfile>) => request<SettingsBundle>('PUT', '/settings/society', p),
      updateValues: (p: Partial<SocietySettings>) => request<SettingsBundle>('PUT', '/settings/values', p),
      updateLoanProduct: (code: LoanProductCode, p: Partial<LoanProduct>) => request<SettingsBundle>('PUT', `/settings/loan-products/${code}`, p),
      departments: () => request<DepartmentRow[]>('GET', '/departments'),
      createDepartment: (d: Partial<Department>) => request<DepartmentRow[]>('POST', '/departments', d),
      updateDepartment: (id: string, d: Partial<Department>) => request<DepartmentRow[]>('PUT', `/departments/${id}`, d),
      users: () => request<StaffUser[]>('GET', '/users'),
      createUser: (u: Partial<StaffUser>) => request<StaffUser[]>('POST', '/users', u),
      updateUser: (id: string, u: Partial<StaffUser>) => request<StaffUser[]>('PUT', `/users/${id}`, u),
      /** Backend only: a temporary password the Super Admin hands over (must be changed at sign-in). */
      resetUserPassword: (id: string) => request<{ userId: string; temporaryPassword: string; mustChangePassword: true }>('POST', `/users/${id}/reset-password`),
      /** Backend only: the user sets up a new authenticator at the next sign-in. */
      resetUserTotp: (id: string) => request<StaffUser[]>('POST', `/users/${id}/reset-totp`),
      permissions: () => request<PermissionMatrix>('GET', '/permissions'),
      templates: () => request<NotificationTemplate[]>('GET', '/notification-templates'),
      updateTemplate: (key: string, t: Partial<NotificationTemplate>) => request<NotificationTemplate[]>('PUT', `/notification-templates/${key}`, t),
    },
    reference: {
      rates: () => request<RatesReference>('GET', '/reference/rates'),
    },
    /** Staff: member master (ST-10 … ST-13). */
    members: {
      list: (params: MemberListParams = {}) => request<MemberList>('GET', `/members${toQuery(params)}`),
      get: (id: string) => request<MemberDetail>('GET', `/members/${id}`),
      create: (input: MemberInput) => request<MemberDetail>('POST', '/members', input),
      update: (id: string, input: MemberInput) => request<MemberDetail>('PUT', `/members/${id}`, input),
      transfer: (id: string, input: TransferInput) => request<MemberDetail>('POST', `/members/${id}/transfers`, input),
      agreeMandate: (id: string) => request<MemberDetail>('POST', `/members/${id}/mandate/agree`),
    },
    /** Staff: profile change requests (ST-18). */
    changeRequests: {
      list: () => request<ChangeRequestList>('GET', '/profile-change-requests'),
      certify: (id: string, approve: boolean, remarks?: string) => request<ChangeRequestRow>('POST', `/profile-change-requests/${id}/certify`, { approve, remarks }),
      decide: (id: string, approve: boolean, remarks?: string) => request<ChangeRequestRow>('POST', `/profile-change-requests/${id}/decision`, { approve, remarks }),
    },
    /** Staff: loans (ST-20, ST-21, ST-23). */
    loans: {
      list: (params: LoanListParams = {}) => request<LoanList>('GET', `/loans${toQuery(params)}`),
      get: (id: string) => request<LoanDetail>('GET', `/loans/${id}`),
      context: (memberId: string) => request<LoanContext>('GET', `/members/${memberId}/loan-context`),
      createOnBehalf: (memberId: string, input: LoanRequestInput, submit: boolean) => request<LoanDetail>('POST', '/loans', { memberId, ...input, submit }),
      assess: (input: LoanRequestInput & { memberId?: string; loanId?: string }) => request<LoanAssessment>('POST', '/loans/assess', input),
      suretyPreview: (sureties: string[], instalments: number, borrowerId?: string) => request<SuretyCard[]>('POST', '/loans/surety-preview', { sureties, instalments, borrowerId }),
      searchMembers: (q: string) => request<MemberPick[]>('GET', `/members/search${toQuery({ q })}`),
      act: (id: string, action: string, input: LoanActionInput = {}) => request<LoanDetail>('POST', `/loans/${id}/actions/${action}`, input),
      demoAct: (id: string) => request<LoanDetail>('POST', `/loans/${id}/demo-act`),
      sanctionPreview: (id: string, amount?: number, instalments?: number) => request<SanctionPreview>('GET', `/loans/${id}/sanction-preview${toQuery({ amount, instalments })}`),
    },
    /** Staff: deposits (ST-30 … ST-33). */
    deposits: {
      list: (params: DepositListParams = {}) => request<DepositList>('GET', `/deposits${toQuery(params)}`),
      get: (id: string) => request<DepositDetail>('GET', `/deposits/${id}`),
      open: (memberId: string, input: FdRequestInput) => request<DepositDetail>('POST', '/deposits', { memberId, ...input }),
      act: (id: string, action: string, input: DepositActionInput = {}) => request<DepositDetail>('POST', `/deposits/${id}/actions/${action}`, input),
      demoAct: (id: string) => request<DepositDetail>('POST', `/deposits/${id}/demo-act`),
    },
    /** Staff: demand sheets (ST-40 … ST-43). */
    demand: {
      overview: (cycle?: string) => request<DemandCycleOverview>('GET', `/demand${toQuery({ cycle })}`),
      preview: (cycle: string, departmentIds: string[] = []) => request<DemandPreview>('GET', `/demand/preview${toQuery({ cycle, departmentIds: departmentIds.join(',') || undefined })}`),
      generate: (cycle: string, departmentIds: string[]) => request<{ generated: string[] }>('POST', '/demand/generate', { cycle, departmentIds }),
      sheet: (id: string) => request<DemandSheetDetail>('GET', `/demand/sheets/${id}`),
      act: (id: string, action: 'certify' | 'sendToDdo' | 'postRecovery', input: Partial<RecoveryInput> = {}) => request<DemandSheetDetail>('POST', `/demand/sheets/${id}/actions/${action}`, input),
      demoAct: (id: string) => request<DemandSheetDetail>('POST', `/demand/sheets/${id}/demo-act`),
    },
    /** Staff: receipts and member-reported payments (ST-44 … ST-47). */
    receipts: {
      list: (params: ReceiptListParams = {}) => request<ReceiptList>('GET', `/receipts${toQuery(params)}`),
      get: (id: string) => request<ReceiptDetail>('GET', `/receipts/${id}`),
      create: (input: NewReceiptInput) => request<ReceiptDetail>('POST', '/receipts', input),
      dues: (memberId: string) => request<MemberDues>('GET', `/members/${memberId}/dues`),
      reports: (status?: string) => request<PaymentReportRow[]>('GET', `/payment-reports${toQuery({ status })}`),
      verify: (id: string, remarks?: string) => request<ReceiptDetail>('POST', `/payment-reports/${id}/verify`, { remarks }),
      reject: (id: string, reason: string) => request<PaymentReportRow>('POST', `/payment-reports/${id}/reject`, { reason }),
    },
    /** Member: payments & statements (MB-10, MB-18). */
    myPayments: {
      get: () => request<MyPayments>('GET', '/me/payments'),
      receipt: (id: string) => request<ReceiptDetail>('GET', `/me/receipts/${id}`),
      report: (input: ReportPaymentInput) => request<PaymentReport>('POST', '/me/payments/reports', input),
    },
    /** Member: deposits (MB-08, MB-09, MB-15). */
    myDeposits: {
      list: () => request<DepositRow[]>('GET', '/me/deposits'),
      context: () => request<DepositContext>('GET', '/me/deposits/context'),
      get: (id: string) => request<DepositDetail>('GET', `/me/deposits/${id}`),
      requestSign: (input: FdRequestInput) => request<OtpChallenge>('POST', '/me/deposits/sign/request', input),
      create: (otpRef: string, otp: string) => request<DepositDetail>('POST', '/me/deposits', { otpRef, otp }),
      cancel: (id: string, reason?: string) => request<DepositDetail>('POST', `/me/deposits/${id}/cancel`, { reason }),
    },
    /** ST-02 Work Queue. */
    workQueue: () => request<WorkQueue>('GET', '/work-queue'),
    /** Member: surety requests (MB-07). */
    surety: {
      list: () => request<SuretyRequests>('GET', '/me/surety-requests'),
      requestSign: (loanId: string) => request<OtpChallenge>('POST', `/me/surety-requests/${loanId}/sign/request`),
      accept: (loanId: string, otpRef: string, otp: string) => request<SuretyRequest>('POST', `/me/surety-requests/${loanId}/accept`, { otpRef, otp }),
      decline: (loanId: string, reason: string) => request<SuretyRequest>('POST', `/me/surety-requests/${loanId}/decline`, { reason }),
    },
    /** Member: own loans (MB-03 … MB-05). */
    myLoans: {
      list: () => request<LoanRow[]>('GET', '/me/loans'),
      context: () => request<LoanContext>('GET', '/me/loans/context'),
      get: (id: string) => request<LoanDetail>('GET', `/me/loans/${id}`),
      createDraft: (input: LoanRequestInput) => request<LoanDetail>('POST', '/me/loans', input),
      saveDraft: (id: string, input: LoanRequestInput) => request<LoanDetail>('PUT', `/me/loans/${id}`, input),
      discard: (id: string) => request<{ ok: true }>('DELETE', `/me/loans/${id}`),
      requestSign: (id: string) => request<OtpChallenge>('POST', `/me/loans/${id}/sign/request`),
      submit: (id: string, otpRef: string, otp: string) => request<LoanDetail>('POST', `/me/loans/${id}/submit`, { otpRef, otp }),
      withdraw: (id: string, reason?: string) => request<LoanDetail>('POST', `/me/loans/${id}/withdraw`, { reason }),
      replaceSurety: (id: string, oldId: string, newId: string) => request<LoanDetail>('POST', `/me/loans/${id}/sureties/replace`, { oldId, newId }),
    },
    /** Member: own profile (MB-02, MB-19). */
    profile: {
      get: () => request<MyProfile>('GET', '/me/profile'),
      updateContact: (input: ContactUpdateInput) => request<MyProfile>('PATCH', '/me/profile/contact', input),
      requestMobileChange: (mobile: string) => request<OtpChallenge>('POST', '/me/profile/mobile', { mobile }),
      verifyMobileChange: (otpRef: string, otp: string) => request<MyProfile>('POST', '/me/profile/mobile/verify', { otpRef, otp }),
      requestChange: (input: ChangeRequestInput) => request<ProfileChangeRequest>('POST', '/me/profile/change-requests', input),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function toQuery(params: object): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isErrorBody(x: unknown): x is ServiceErrorBody {
  return typeof x === 'object' && x !== null && 'code' in x && 'message' in x;
}
