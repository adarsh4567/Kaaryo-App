/**
 * Discounted trial bookings — `/api/user/trials/*`.
 *
 * A trial job is the last filter in worker onboarding: a trainee cleaner does one
 * subsidised job and the customer's feedback decides whether they get approved.
 * The customer pays ₹100 on a ₹110 job and gets ₹40 back as a wallet reward, so
 * for them it is a cheap clean; for the platform it is how the trial queue clears.
 *
 * Deliberately its own module rather than an option on `lib/userRequests`, for
 * three reasons the two flows cannot paper over:
 *
 *  - **The statuses are different.** A trial is `assigned` (which *is* the
 *    searching state) / `accepted` / `in_progress` / `completed` / `declined` /
 *    `expired`. There is no `searching` and no `pending_rating`. Reusing the
 *    service-request switch routes every screen wrong.
 *  - **Cleaning only.** `category` is fixed server-side; sending one is a 422.
 *  - **The search is a directed offer, not a broadcast.** Up to three trainees
 *    are asked one at a time, 90s each, so the wait reaches ~4.5 minutes and
 *    progresses visibly — see `candidateNumber` / `candidateCount`.
 *
 * The transport and the error shape are shared with `lib/userRequests`, because
 * the envelope and the 402/409 contract really are identical.
 */

import {
  callUserApi,
  isRequestApiError,
  type PaymentMethod,
  type PaymentStatus,
  type RequestApiError,
} from './userRequests';

export type { PaymentMethod, PaymentStatus };

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * `assigned` is the searching state — the offer is out to one trainee with a
 * countdown running. There is no `searching` value.
 */
export type TrialStatus =
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'expired';

/** Which screen a trial belongs on. Mirrors the guide's `trialScreen()`. */
export type TrialScreen =
  | 'searching'
  | 'tracking'
  | 'payment'
  | 'feedback'
  | 'receipt'
  | 'retry'
  | 'unavailable'
  | 'home';

/**
 * The four numbers that are the whole offer. Never hardcode them — they are
 * env-tunable server-side, and `netCost` is only present on the offer response.
 */
export interface TrialPricing {
  currency: string;
  /** What the job is worth. Show struck through. */
  basePrice: number;
  /** What the customer actually pays. */
  userPrice: number;
  userSavings: number;
  userDiscountPercent: number;
  rewardPercent: number;
  /** Credited to the wallet on payment, not on booking or approval. */
  rewardAmount: number;
  /** `userPrice - rewardAmount`. Offer only; derive with `netCostOf` elsewhere. */
  netCost?: number;
}

export interface TrialSubcategory {
  key: string;
  name: string;
}

/** Why the offer is unavailable. `null` when it is. */
export type TrialOfferCode =
  | 'TRIAL_IN_PROGRESS'
  | 'TRIAL_ALLOWANCE_USED'
  | 'TRIAL_DISABLED';

/**
 * The entry-point gate. Always `200` — `available: false` is an answer, not an
 * error, and `reason` is display-ready text.
 */
export interface TrialOffer {
  available: boolean;
  reason: string | null;
  code: TrialOfferCode | string | null;
  /** Set when `code` is `TRIAL_IN_PROGRESS` — navigate to this trial. */
  liveTrialId: string | null;
  used: number;
  /** 1 by default: one discounted trial per account. Read, never assume. */
  allowance: number;
  category: string;
  categoryName: string;
  subcategories: TrialSubcategory[];
  pricing: TrialPricing;
  /** How long each individual trainee has to answer. */
  offerWindowSeconds: number;
}

export interface TrialPayment {
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

export interface TrialReward {
  amount: number;
  percent: number;
  /** True once the wallet credit exists. Created inside payment confirm. */
  credited: boolean;
  creditedAt: string | null;
}

/** Present only once a trainee has accepted. There is no live position or ETA. */
export interface TrialWorker {
  id: string;
  name: string;
  phone: string;
  /** Null for a professional with no ratings yet — render "New", not 0. */
  rating: number | null;
  jobsCompleted: number;
  distanceKm: number;
  /** Always true here — badge it, the customer was told who they were getting. */
  isTrainee: boolean;
}

/** The one shape every trial endpoint and every `trial:*` socket event returns. */
export interface Trial {
  id: string;
  /** Tells trial cards from normal booking cards in a merged list. */
  type: 'trial';
  status: TrialStatus;

  /** Always `cleaning`. */
  category: string;
  subcategory: string | null;
  jobDescription?: string;
  address?: string;
  /** GeoJSON — `[lng, lat]`, not the other way round. */
  location?: { type: string; coordinates: [number, number] };
  scheduledTime?: string | null;

  pricing: TrialPricing;

  // ── Search telemetry, while status === 'assigned' ──
  /** Which trainee is being asked right now, 1-based → "asking 2 of 3". */
  candidateNumber?: number;
  candidateCount?: number;
  /** This trainee's 90s deadline. */
  offerExpiresAt?: string | null;
  /** The whole search's deadline — render the customer countdown off this. */
  searchExpiresAt?: string | null;
  /** Snapshot at response time; goes stale, so prefer `trialSecondsLeft()`. */
  secondsRemaining: number;
  searchAttempt: number;

  // ── Server-decided affordances — render buttons off these, do not re-derive ──
  canCancel: boolean;
  canRetry: boolean;
  /** `completed` and not yet submitted — show the Rate CTA. */
  feedbackPending: boolean;
  feedbackSubmitted: boolean;

  payment: TrialPayment;
  reward: TrialReward;
  worker?: TrialWorker;

  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  /** Only on `declined` / `expired`. */
  endedReason?: 'worker_declined' | 'timeout' | 'customer_cancelled';
}

/**
 * A history row. Compact on purpose — it is not a `Trial`, so a list that mixes
 * the two has to keep them apart rather than casting one to the other.
 */
export interface TrialSummary {
  id: string;
  type: 'trial';
  status: TrialStatus;
  category: string;
  subcategory: string | null;
  userPrice: number;
  currency: string;
  rewardAmount: number;
  rewardCredited: boolean;
  paymentStatus: PaymentStatus;
  feedbackSubmitted: boolean;
  canRetry: boolean;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateTrialInput {
  /** A `key` from the offer's `subcategories`. Optional. */
  subcategory?: string | null;
  /** ≤ 500 chars, shown verbatim to the trainee. */
  jobDescription: string;
  lat: number;
  lng: number;
  address?: string;
  /** ISO date. Omit for "as soon as possible". */
  scheduledTime?: string;
}

export interface CreateTrialResult {
  trial: Trial;
  candidateCount: number;
  offerWindowSeconds: number;
  /**
   * True when the server handed back an already-live trial instead of making a
   * new one — a navigation event, not a failure.
   */
  existing: boolean;
}

export interface RetryTrialResult {
  trial: Trial;
  candidateCount: number;
}

export interface InitiateTrialPaymentResult {
  trial: Trial;
  /** Absent when the trial was already paid — nothing left to capture. */
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

export interface ConfirmTrialPaymentResult {
  trial: Trial;
  /** False on a replayed confirm — nobody is rewarded twice. */
  rewardCredited: boolean;
  rewardAmount: number;
  message: string;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export interface FeedbackOption {
  /** The stable contract. `label` and `prompt` are placeholder-quality wording. */
  value: string;
  label: string;
}

export interface FeedbackQuestion {
  key: string;
  prompt: string;
  /** `single` is a radio group (q1–q9); `text` is free text (q10 only). */
  type: 'single' | 'text';
  optional: boolean;
  options?: FeedbackOption[];
}

export interface FeedbackForm {
  trial: { id: string; category: string; completedAt: string | null };
  worker: { name: string; isTrainee: boolean };
  questions: FeedbackQuestion[];
}

/**
 * Drives the thank-you copy only.
 *
 * Never rendered as a hiring decision, and `workerApproved: false` gets no
 * distinct message — the customer rated a job, they did not sit on a panel, and
 * telling them they rejected somebody is not information they asked for.
 */
export interface FeedbackOutcome {
  workerApproved: boolean;
  underReview: boolean;
}

export interface FeedbackResult {
  trial: Trial;
  outcome: FeedbackOutcome;
  message: string;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  source: string;
  note: string;
  createdAt: string;
}

export interface Wallet {
  balance: number;
  currency: string;
  /**
   * False today — spending the balance is not built. Branch on this rather than
   * hardcoding, so the screen lights up when redemption ships.
   */
  redeemable: boolean;
  transactions: WalletTransaction[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type TrialApiError = RequestApiError;

export const isTrialApiError = isRequestApiError;

/** The trial carried by a 409 `TRIAL_IN_PROGRESS`, if this is one. */
export function inProgressTrialFrom(err: unknown): Trial | null {
  if (!isTrialApiError(err) || err.status !== 409) return null;
  const trial = err.payload?.trial;
  return trial ? (trial as Trial) : null;
}

/**
 * True for the one error the booking flow must treat as a normal outcome: no
 * trainee is waiting nearby. Trial supply is inherently thin — it is however
 * many people happen to be mid-onboarding in range — so this deserves a screen,
 * not a toast. Nothing was created, so there is no id to retry.
 */
export function isNoTrialWorkers(err: unknown): boolean {
  return isTrialApiError(err) && err.code === 'NO_TRIAL_WORKERS';
}

// ─── Offer ────────────────────────────────────────────────────────────────────

/** Gate the trial entry point on this. Cheap, and it answers everything. */
export async function fetchTrialOffer(token: string): Promise<TrialOffer> {
  const data = await callUserApi<TrialOffer>('/api/user/trials/offer', { token });
  return data;
}

// ─── Booking ──────────────────────────────────────────────────────────────────

/**
 * Books the trial and starts the trainee search — the first candidate already
 * has the offer by the time this returns.
 *
 * Never send `category` (fixed to cleaning server-side, a 422 otherwise) and
 * never send name or phone: they come off the token, and the trainee sees them.
 *
 * A 409 `TRIAL_IN_PROGRESS` is folded into a normal result with `existing: true`,
 * because one live trial per customer is a rule to navigate around rather than
 * report as a failure. `NO_TRIAL_WORKERS` is left to throw — see
 * `isNoTrialWorkers`.
 */
export async function createTrial(
  token: string,
  input: CreateTrialInput
): Promise<CreateTrialResult> {
  try {
    const data = await callUserApi<{
      trial: Trial;
      candidateCount?: number;
      offerWindowSeconds?: number;
    }>('/api/user/trials', { method: 'POST', token, body: input });
    return {
      trial: data.trial,
      candidateCount: data.candidateCount ?? data.trial.candidateCount ?? 1,
      offerWindowSeconds: data.offerWindowSeconds ?? 90,
      existing: false,
    };
  } catch (err) {
    const live = inProgressTrialFrom(err);
    if (live) {
      return {
        trial: live,
        candidateCount: live.candidateCount ?? 1,
        offerWindowSeconds: 90,
        existing: true,
      };
    }
    throw err;
  }
}

export async function getTrial(token: string, id: string): Promise<Trial> {
  const data = await callUserApi<{ trial: Trial }>(`/api/user/trials/${id}`, { token });
  return data.trial;
}

/**
 * The app-launch call. Null when nothing is live.
 *
 * Includes a `completed` trial whose feedback is still outstanding, because that
 * form is the thing most easily lost across an app restart — and it is what
 * onboards a real person.
 */
export async function getActiveTrial(token: string): Promise<Trial | null> {
  const data = await callUserApi<{ trial: Trial | null }>('/api/user/trials/active', {
    token,
  });
  return data.trial ?? null;
}

export async function listTrials(
  token: string
): Promise<{ active: Trial[]; history: TrialSummary[] }> {
  const data = await callUserApi<{ active?: Trial[]; history?: TrialSummary[] }>(
    '/api/user/trials',
    { token }
  );
  return { active: data.active ?? [], history: data.history ?? [] };
}

/**
 * Calls the trial off. Free, and it does not consume the account's allowance —
 * the customer got no service. The trainee goes back into the trial queue, so it
 * costs them nothing either.
 */
export async function cancelTrial(token: string, id: string): Promise<Trial> {
  const data = await callUserApi<{ trial: Trial }>(`/api/user/trials/${id}/cancel`, {
    method: 'POST',
    token,
  });
  return data.trial;
}

/**
 * Searches again after the whole candidate queue passed. Keeps the same id, so
 * open screens and pollers stay valid, and rebuilds the queue from a fresh
 * search — the point of retrying is that available supply has changed.
 *
 * Unlike normal bookings there is no retry cap: a retry costs the platform
 * nothing until somebody accepts.
 */
export async function retryTrial(token: string, id: string): Promise<RetryTrialResult> {
  const data = await callUserApi<{ trial: Trial; candidateCount?: number }>(
    `/api/user/trials/${id}/retry`,
    { method: 'POST', token }
  );
  return {
    trial: data.trial,
    candidateCount: data.candidateCount ?? data.trial.candidateCount ?? 1,
  };
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export async function initiateTrialPayment(
  token: string,
  id: string,
  method: PaymentMethod
): Promise<InitiateTrialPaymentResult> {
  const data = await callUserApi<{
    trial: Trial;
    payment?: InitiateTrialPaymentResult['payment'];
  }>(`/api/user/trials/${id}/payment/initiate`, { method: 'POST', token, body: { method } });
  return { trial: data.trial, payment: data.payment ?? null };
}

/**
 * Captures the payment and credits the ₹40 reward in the same call.
 *
 * `rewardCredited` says whether *this* call created the credit, so a replayed
 * confirm returns `false` and rewards nobody twice. Safe to retry.
 */
export async function confirmTrialPayment(
  token: string,
  id: string,
  orderId: string,
  gatewayReference?: string
): Promise<ConfirmTrialPaymentResult> {
  const data = await callUserApi<{
    trial: Trial;
    rewardCredited?: boolean;
    rewardAmount?: number;
    message: string;
  }>(`/api/user/trials/${id}/payment/confirm`, {
    method: 'POST',
    token,
    body: { orderId, ...(gatewayReference ? { gatewayReference } : {}) },
  });
  return {
    trial: data.trial,
    rewardCredited: data.rewardCredited ?? false,
    rewardAmount: data.rewardAmount ?? data.trial.reward?.amount ?? 0,
    message: data.message,
  };
}

/**
 * The whole capture, including the gateway hop. Same shape as the normal
 * booking flow's `payForRequest`, so the payment screen is shared.
 */
export async function payForTrial(
  token: string,
  id: string,
  method: PaymentMethod
): Promise<{
  trial: Trial;
  alreadyPaid: boolean;
  rewardCredited: boolean;
  rewardAmount: number;
}> {
  const { trial, payment } = await initiateTrialPayment(token, id, method);
  if (!payment) {
    return { trial, alreadyPaid: true, rewardCredited: false, rewardAmount: 0 };
  }

  // Real gateway: hand `payment.orderId` to the SDK and pass back its reference.
  const gatewayReference = undefined;

  const confirmed = await confirmTrialPayment(token, id, payment.orderId, gatewayReference);
  return {
    trial: confirmed.trial,
    alreadyPaid: false,
    rewardCredited: confirmed.rewardCredited,
    rewardAmount: confirmed.rewardAmount,
  };
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

/**
 * The 10 questions. **Render the form from this** — the wording is explicitly
 * placeholder-quality and will change; only the `value` strings are stable.
 *
 * The response deliberately does not say which answer is the "good" one, and the
 * app must not infer or hint it: a form that telegraphs the right answer is
 * worthless as a filter.
 */
export async function fetchFeedbackForm(token: string, id: string): Promise<FeedbackForm> {
  const data = await callUserApi<FeedbackForm>(`/api/user/trials/${id}/feedback-form`, {
    token,
  });
  return data;
}

/** One submission only — re-posting is a 409. */
export async function submitTrialFeedback(
  token: string,
  id: string,
  answers: Record<string, string>
): Promise<FeedbackResult> {
  const data = await callUserApi<{
    trial: Trial;
    outcome?: FeedbackOutcome;
    message: string;
  }>(`/api/user/trials/${id}/feedback`, { method: 'POST', token, body: { answers } });
  return {
    trial: data.trial,
    outcome: data.outcome ?? { workerApproved: false, underReview: false },
    message: data.message,
  };
}

/** The thank-you line for an outcome. Never says the worker was rejected. */
export function feedbackThanks(outcome: FeedbackOutcome, workerName?: string): string {
  const first = workerName?.trim().split(/\s+/)[0];
  if (outcome.workerApproved) {
    return first
      ? `Thanks — ${first} is now a verified Kaaryo professional.`
      : 'Thanks — your feedback onboarded a new Kaaryo professional.';
  }
  if (outcome.underReview) return 'Thanks — our team will review your feedback.';
  return 'Thanks for your feedback.';
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function fetchWallet(token: string): Promise<Wallet> {
  const data = await callUserApi<{
    balance?: number;
    currency?: string;
    redeemable?: boolean;
    transactions?: WalletTransaction[];
  }>('/api/user/wallet', { token });
  return {
    balance: data.balance ?? 0,
    currency: data.currency ?? 'INR',
    redeemable: data.redeemable ?? false,
    transactions: data.transactions ?? [],
  };
}

// ─── Derived state ────────────────────────────────────────────────────────────

/** `userPrice - rewardAmount`, the number the customer is really out of pocket. */
export function netCostOf(pricing: TrialPricing): number {
  return pricing.netCost ?? Math.max(0, pricing.userPrice - pricing.rewardAmount);
}

/**
 * Seconds left in the whole search, from the server's absolute deadline.
 *
 * `searchExpiresAt`, not `offerExpiresAt`: the customer is waiting for the search
 * to resolve, not for one particular trainee's 90 seconds. Never count down from
 * a local number — the server owns when the search dies, and this has to survive
 * the app being backgrounded.
 */
export function trialSecondsLeft(
  trial: Pick<Trial, 'status' | 'searchExpiresAt'>
): number {
  if (trial.status !== 'assigned' || !trial.searchExpiresAt) return 0;
  const ms = new Date(trial.searchExpiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

/**
 * `134` → `"2:14"`.
 *
 * A trial search runs to minutes, not the normal flow's single 60-second window,
 * so a bare seconds count ("214s") stops reading as a wait the customer can size up.
 */
export function formatTrialClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Which screen this trial belongs on.
 *
 * Payment and feedback both unlock at `completed` and are independent — payment
 * comes first because money is time-sensitive, but the feedback form is never
 * gated behind it: that form is what decides a real person's onboarding.
 */
export function trialScreen(trial: Trial): TrialScreen {
  switch (trial.status) {
    case 'assigned':
      return 'searching';
    case 'accepted':
    case 'in_progress':
      return 'tracking';
    case 'completed':
      if (trial.feedbackPending) return 'feedback';
      if (trial.payment.payable) return 'payment';
      return 'receipt';
    case 'declined':
    case 'expired':
      return trial.canRetry ? 'retry' : 'unavailable';
    default:
      return 'home';
  }
}

/**
 * Whether this trial still wants the customer's attention.
 *
 * A completed trial with feedback outstanding counts even once it is paid — the
 * worker's onboarding is waiting on that form, which makes it the most important
 * thing in the list, not the least.
 */
export function isLiveTrial(trial: Trial): boolean {
  if (trial.status === 'assigned' || trial.status === 'accepted') return true;
  if (trial.status === 'in_progress') return true;
  return trial.status === 'completed' && (trial.payment.payable || trial.feedbackPending);
}

// ─── Poller ───────────────────────────────────────────────────────────────────

/**
 * The documented fallback for the `trial:*` Socket.IO channel, which needs a
 * dependency the app does not carry yet. Same information, one round-trip behind.
 *
 * `assigned` polls at the guide's 3s. A settled trial is not polled at all:
 * nothing moves on a `completed`, `declined` or `expired` trial until the
 * customer acts, and the screen already holds the reply from whatever they did.
 */
const POLL_INTERVAL: Partial<Record<TrialStatus, number>> = {
  assigned: 3000,
  accepted: 8000,
  in_progress: 8000,
};

/** Backoff after a network failure — slower than any healthy interval. */
const ERROR_INTERVAL = 6000;

/**
 * Polls one trial until it stops changing on its own, then stops. Callers must
 * invoke the returned stop function on unmount.
 */
export function trackTrial(
  token: string,
  id: string,
  onUpdate: (trial: Trial) => void,
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
      const trial = await getTrial(token, id);
      if (stopped) return;
      onUpdate(trial);

      const next = POLL_INTERVAL[trial.status];
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
