/**
 * Customer service requests — the authenticated, on-demand booking flow.
 *
 * This is `/api/user/service-requests/*`, which is a different contract from the
 * legacy `/api/service-requests` in `lib/api.ts`:
 *
 *  - It is authenticated. Name and phone come off the token, never the body —
 *    posting them would let one account book under another person's contact
 *    details, and the worker sees that contact the moment they accept.
 *  - `category` is validated against the server's catalog, and `totalPrice` is
 *    taken from the server's rate card. The client cannot price a job.
 *  - It runs a 60-second search window with a retry, and a payment lifecycle.
 *
 * The legacy module stays for scheduled bookings, which this backend does not
 * support (it is on-demand only). Requests placed there leave `user` null and so
 * never appear in any endpoint here.
 */

import { getApiUrl } from './api';
import type { ApiError } from './userAuth';

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogSubcategory {
  key: string;
  name: string;
}

/**
 * A bookable category. The `key` is the only value request creation accepts, and
 * `price` is what the request is actually created with — a hardcoded client copy
 * of either is how you get a Book button that 422s or a total that lies.
 */
export interface CatalogCategory {
  key: string;
  name: string;
  /** Hex accent from the server; unused so far, the app tints by its own palette. */
  color: string;
  price: number;
  currency: string;
  subcategories: CatalogSubcategory[];
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export type UserRequestStatus =
  | 'searching'
  | 'in_progress'
  | 'pending_rating'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type PaymentStatus = 'not_due' | 'due' | 'processing' | 'paid' | 'failed';

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cash';

export interface RequestPayment {
  status: PaymentStatus;
  /** The only check the Pay button needs — server-computed, never re-derived. */
  payable: boolean;
  amount: number;
  currency: string;
  method: PaymentMethod | null;
  orderId: string | null;
  transactionId: string | null;
  attempts: number;
  failureReason: string | null;
  dueAt: string | null;
  paidAt: string | null;
}

export type WorkerArrivalStatus = 'en_route' | 'arriving_soon' | 'arrived';

/**
 * The composed, render-off-this state — `status` + `workStage` + the server's
 * geofence, in that precedence. Exists so the header, the badge and the
 * timeline can't disagree with each other, and so the list card and the detail
 * screen can't disagree either (`stage` is on the summary view too).
 *
 * `en_route` / `arriving_soon` / `arrived` / `working` are all `status:
 * 'in_progress'` underneath — `status` stays authoritative for payment,
 * cancel and retry, `stage` is authoritative for what you render.
 */
export type RequestStage =
  | 'searching'
  | 'en_route'
  | 'arriving_soon'
  | 'arrived'
  | 'working'
  | 'work_done'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** The raw sub-field `stage` is composed from. Rarely needed directly. */
export type WorkStage = 'en_route' | 'working' | null;

/** Present only once a professional has accepted. */
export interface AssignedWorker {
  id: string;
  name: string;
  phone: string;
  /**
   * Static, cacheable URL to a square headshot — present (as a key) on every
   * `worker` the server sends, `null` rather than omitted when the worker has
   * no photo on file. Loadable directly with no auth header. Fall back to the
   * initials avatar on `null`, never hide the card.
   */
  photoUrl: string | null;
  /** Null for a professional with no ratings yet — render "New", not 0. */
  rating: number | null;
  jobsCompleted: number;
  /** Measured when the offer went out — fixed, historical. Show this on the card. */
  distanceKm: number;

  // ── Live tracking fields — present only while `stage` is 'en_route' /
  // 'arriving_soon' / 'arrived' / 'working'. Absent on a settled request, not
  // just unpinged — don't treat a missing `location` on a finished job as
  // "hasn't pinged yet". Gate rendering on `stage`, not on these being present.
  /** GeoJSON `[lng, lat]`. This job's own live stream — falls back to the
   * worker's last availability heartbeat until the first real ping lands. */
  location?: { type: string; coordinates: [number, number] };
  /** ISO timestamp of the last GPS ping. */
  locationUpdatedAt?: string;
  /** True when that fix is over ~60s old — grey the marker, don't hide it. */
  locationStale?: boolean;
  /** Compass heading 0-360. Rotate the marker by this. */
  heading?: number | null;
  speedKmh?: number;
  /** Live straight-line distance, in metres. */
  distanceMeters?: number;
  /** Same distance as `distanceMeters`, in km — show this in the map header, never `distanceKm`. */
  liveDistanceKm?: number;
  /** Null until an estimate exists. */
  etaMinutes?: number | null;
  /** 'estimate' = straight-line ÷ assumed speed, word it with a "~". 'directions' = a routing provider answered. */
  etaSource?: 'estimate' | 'directions';
  /**
   * The server's verdict, with hysteresis and an accuracy gate behind it.
   * Never re-derive this from `location` — one bad GPS fix must not show
   * "Arrived" on this phone while the server and the worker's app disagree.
   */
  arrivalStatus?: WorkerArrivalStatus;
  arrivalStatusChangedAt?: string;
}

/**
 * The one shape every endpoint returns. History rows are the same object minus
 * `location`, `jobDescription` and `worker`, which is why those are optional.
 */
export interface UserRequest {
  id: string;
  status: UserRequestStatus;
  /** Render the header/badge/timeline off this, not off `status`. Always present. */
  stage: RequestStage;
  /** The raw sub-field `stage` is partly composed from. Rarely needed directly. */
  workStage?: WorkStage;
  category: string;
  categoryName: string;
  subcategory: string | null;
  subcategoryName: string | null;
  jobDescription?: string;
  totalPrice: number;
  currency: string;
  address?: string;
  /** GeoJSON — `[lng, lat]`, not the other way round. */
  location?: { type: string; coordinates: [number, number] };

  // Search telemetry
  radiusKm?: number;
  wave?: number;
  attempt: number;
  maxAttempts: number;
  workersNotified?: number;
  workersNotifiedTotal?: number;
  searchStartedAt?: string | null;
  /** Absolute deadline. Null unless searching — render the countdown off this. */
  searchExpiresAt?: string | null;
  /** Snapshot at response time; goes stale, so prefer `secondsLeft()`. */
  secondsRemaining: number;

  // Server-decided affordances — render buttons off these, do not re-derive
  canRetry: boolean;
  canCancel?: boolean;

  payment: RequestPayment;
  worker?: AssignedWorker;

  acceptedAt?: string;
  workDoneAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateRequestInput {
  category: string;
  subcategory?: string | null;
  jobDescription: string;
  lat: number;
  lng: number;
  address?: string;
  /** Overrides the 3 km first wave. Rarely useful from the app. */
  radiusKm?: number;
}

export interface CreateRequestResult {
  request: UserRequest;
  workersNotified: number;
  searchWindowSeconds: number;
  /**
   * True when the server handed back an already-live request instead of making a
   * new one — the 409 double-tap guard, which is a navigation event, not a failure.
   */
  existing: boolean;
}

export interface RetryResult {
  request: UserRequest;
  workersNotified: number;
  attempt: number;
  maxAttempts: number;
}

export interface InitiatePaymentResult {
  request: UserRequest;
  /** Absent when the job was already paid — there is nothing left to capture. */
  payment: {
    orderId: string;
    amount: number;
    currency: string;
    method: PaymentMethod;
    provider: string;
    /** `mock` means there is no gateway SDK — go straight to confirm. */
    mode: string;
  } | null;
}

export interface ConfirmPaymentResult {
  request: UserRequest;
  /** False on a replayed confirm — nobody is paid twice. */
  workerCredited: boolean;
  message: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Adds the two things the flow branches on that `lib/userAuth`'s error does not
 * carry: the machine-readable `code`, and the response body — a 409
 * `REQUEST_IN_PROGRESS` returns the live request inside it, and a 402 returns the
 * updated one so the payment screen can re-render straight from the failure.
 */
export interface RequestApiError extends ApiError {
  code?: string;
  payload?: Record<string, unknown> | null;
}

export function isRequestApiError(err: unknown): err is RequestApiError {
  return err instanceof Error && typeof (err as RequestApiError).status === 'number';
}

/** The request carried by a 409 `REQUEST_IN_PROGRESS`, if this is one. */
export function inProgressRequestFrom(err: unknown): UserRequest | null {
  if (!isRequestApiError(err) || err.status !== 409) return null;
  const request = err.payload?.request;
  return request ? (request as UserRequest) : null;
}

// ─── Transport ────────────────────────────────────────────────────────────────

/**
 * Reads the flat `{ success, message, ...payload }` envelope every `/api/user/*`
 * endpoint returns, and turns a failure into a `RequestApiError`.
 *
 * Exported because the discounted-trial flow in `lib/userTrials.ts` speaks the
 * exact same envelope and error contract — the two modules cover different
 * resources, but a second copy of this would be a second place for the 402/409
 * handling to drift.
 */
export async function callUserApi<T>(
  path: string,
  { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: (Record<string, unknown> & { success?: boolean; message?: string }) | null = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body (proxy page, empty 502) — handled by the throw below.
  }

  if (!res.ok || !payload?.success) {
    // 5xx messages are internal detail; 4xx messages are written for users.
    const message =
      (res.status < 500 ? payload?.message : null) ?? 'Something went wrong. Please try again.';
    const error = new Error(message) as RequestApiError;
    error.status = res.status;
    error.isAuthFailure = res.status === 401;
    error.isBlocked = res.status === 403;
    error.isOtpUnavailable = false;
    error.code = typeof payload?.code === 'string' ? payload.code : undefined;
    error.payload = payload;
    throw error;
  }

  return payload as T;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** Public — no token. The category picker must come from here. */
export async function fetchServiceCatalog(): Promise<CatalogCategory[]> {
  const data = await callUserApi<{ services: CatalogCategory[] }>('/api/services');
  return data.services ?? [];
}

// ─── Booking ──────────────────────────────────────────────────────────────────

/**
 * Raises a request and starts the search. `workersNotified: 0` is not an error —
 * the request is live and the radius widens on its own.
 *
 * A 409 `REQUEST_IN_PROGRESS` is folded into a normal result with
 * `existing: true`, because one live request per customer is a rule the app
 * should navigate around rather than report as a failure.
 */
export async function createUserRequest(
  token: string,
  input: CreateRequestInput
): Promise<CreateRequestResult> {
  try {
    const data = await callUserApi<{
      request: UserRequest;
      workersNotified?: number;
      searchWindowSeconds?: number;
    }>('/api/user/service-requests', { method: 'POST', token, body: input });
    return {
      request: data.request,
      workersNotified: data.workersNotified ?? 0,
      searchWindowSeconds: data.searchWindowSeconds ?? 60,
      existing: false,
    };
  } catch (err) {
    const live = inProgressRequestFrom(err);
    if (live) {
      return {
        request: live,
        workersNotified: live.workersNotified ?? 0,
        searchWindowSeconds: 60,
        existing: true,
      };
    }
    throw err;
  }
}

export async function getUserRequest(token: string, id: string): Promise<UserRequest> {
  const data = await callUserApi<{ request: UserRequest }>(`/api/user/service-requests/${id}`, { token });
  return data.request;
}

/** The app-launch call. Null when nothing is live. */
export async function getActiveUserRequest(token: string): Promise<UserRequest | null> {
  const data = await callUserApi<{ request: UserRequest | null }>(
    '/api/user/service-requests/active',
    { token }
  );
  return data.request ?? null;
}

export async function listUserRequests(
  token: string
): Promise<{ active: UserRequest[]; history: UserRequest[] }> {
  const data = await callUserApi<{ active?: UserRequest[]; history?: UserRequest[] }>(
    '/api/user/service-requests',
    { token }
  );
  return { active: data.active ?? [], history: data.history ?? [] };
}

export async function cancelUserRequest(token: string, id: string): Promise<UserRequest> {
  const data = await callUserApi<{ request: UserRequest }>(
    `/api/user/service-requests/${id}/cancel`,
    { method: 'POST', token }
  );
  return data.request;
}

/**
 * Searches again after an expiry. Keeps the same id — open screens, deep links
 * and pollers all stay valid; only `attempt` and the countdown reset.
 */
export async function retryUserRequest(token: string, id: string): Promise<RetryResult> {
  const data = await callUserApi<{
    request: UserRequest;
    workersNotified?: number;
    attempt?: number;
    maxAttempts?: number;
  }>(`/api/user/service-requests/${id}/retry`, { method: 'POST', token });
  return {
    request: data.request,
    workersNotified: data.workersNotified ?? 0,
    attempt: data.attempt ?? data.request.attempt,
    maxAttempts: data.maxAttempts ?? data.request.maxAttempts,
  };
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export async function initiatePayment(
  token: string,
  id: string,
  method: PaymentMethod
): Promise<InitiatePaymentResult> {
  const data = await callUserApi<{
    request: UserRequest;
    payment?: InitiatePaymentResult['payment'];
  }>(`/api/user/service-requests/${id}/payment/initiate`, {
    method: 'POST',
    token,
    body: { method },
  });
  return { request: data.request, payment: data.payment ?? null };
}

/**
 * Captures the payment and credits the professional in the same call.
 *
 * Safe to retry: a replayed confirm returns 200 with `workerCredited: false` and
 * pays nobody twice, so a response lost to a flaky network just gets sent again.
 */
export async function confirmPayment(
  token: string,
  id: string,
  orderId: string,
  gatewayReference?: string
): Promise<ConfirmPaymentResult> {
  const data = await callUserApi<{
    request: UserRequest;
    workerCredited?: boolean;
    message: string;
  }>(`/api/user/service-requests/${id}/payment/confirm`, {
    method: 'POST',
    token,
    body: { orderId, ...(gatewayReference ? { gatewayReference } : {}) },
  });
  return {
    request: data.request,
    workerCredited: data.workerCredited ?? false,
    message: data.message,
  };
}

/**
 * The whole capture, including the gateway hop.
 *
 * In `mock` mode there is no SDK to open, so initiate feeds confirm directly.
 * A real gateway slots in at the marked line without any shape changing.
 */
export async function payForRequest(
  token: string,
  id: string,
  method: PaymentMethod
): Promise<{ request: UserRequest; alreadyPaid: boolean; workerCredited: boolean }> {
  const { request, payment } = await initiatePayment(token, id, method);
  if (!payment) return { request, alreadyPaid: true, workerCredited: false };

  // Real gateway: hand `payment.orderId` to the SDK and pass back its reference.
  const gatewayReference = undefined;

  const confirmed = await confirmPayment(token, id, payment.orderId, gatewayReference);
  return {
    request: confirmed.request,
    alreadyPaid: false,
    workerCredited: confirmed.workerCredited,
  };
}

// ─── Derived state ────────────────────────────────────────────────────────────

/**
 * Seconds left in the search, from the server's absolute deadline.
 *
 * Never count down from a local 60 — the server owns when a search dies, and a
 * phone that was backgrounded or whose clock is skewed still shows the truth.
 */
export function secondsLeft(request: Pick<UserRequest, 'status' | 'searchExpiresAt'>): number {
  if (request.status !== 'searching' || !request.searchExpiresAt) return 0;
  const ms = new Date(request.searchExpiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

/**
 * Whether this request still wants the customer's attention.
 *
 * A completed-but-unpaid job counts: it is finished, but it is also the easiest
 * thing in the app to lose track of, so it stays in the live list until paid.
 */
export function isLiveRequest(request: UserRequest): boolean {
  if (request.status === 'searching' || request.status === 'in_progress') return true;
  if (request.status === 'pending_rating') return true;
  return request.status === 'completed' && request.payment.payable;
}

/** Statuses where nothing more will change without the customer acting. */
export function isSettledRequest(request: UserRequest): boolean {
  return (
    request.status === 'cancelled' ||
    request.status === 'expired' ||
    (request.status === 'completed' && !request.payment.payable)
  );
}

// ─── Poller ───────────────────────────────────────────────────────────────────

/** The guide's 2–3s while searching; far slower once the outcome is settled. */
const POLL_INTERVAL: Partial<Record<UserRequestStatus, number>> = {
  searching: 2500,
  in_progress: 8000,
  pending_rating: 12000,
};

/**
 * While the worker is actually moving (`en_route` / `arriving_soon`), poll
 * faster than the base `in_progress` interval so the map doesn't visibly lag —
 * this is the documented fallback for the socket channel, not a replacement
 * for it. Once `arrived` or `working`, nobody is moving anymore, so the base
 * interval is plenty.
 */
const IN_PROGRESS_TRACKING_INTERVAL = 4500;

function pollIntervalFor(request: UserRequest): number | undefined {
  if (request.stage === 'en_route' || request.stage === 'arriving_soon') {
    return IN_PROGRESS_TRACKING_INTERVAL;
  }
  return POLL_INTERVAL[request.status];
}

/** Backoff after a network failure — slower than any healthy interval. */
const ERROR_INTERVAL = 6000;

/**
 * Polls one request until it stops changing on its own, then stops.
 *
 * This is the documented fallback for the Socket.IO channel, which needs a
 * dependency the app does not carry yet. Same information, one round-trip of
 * latency behind. Callers must invoke the returned stop function on unmount.
 */
export function trackUserRequest(
  token: string,
  id: string,
  onUpdate: (request: UserRequest) => void,
  onError?: (err: Error) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function tick() {
    if (stopped) return;
    try {
      const request = await getUserRequest(token, id);
      if (stopped) return;
      onUpdate(request);

      const next = pollIntervalFor(request);
      // Expired is not terminal — the customer may retry — but nothing moves
      // until they do, so there is no reason to keep asking.
      if (!next) return stop();
      timer = setTimeout(tick, next);
    } catch (err) {
      if (stopped) return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
      timer = setTimeout(tick, ERROR_INTERVAL);
    }
  }

  tick();
  return stop;
}
