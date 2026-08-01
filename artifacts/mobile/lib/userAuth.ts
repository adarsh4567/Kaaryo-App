/**
 * Customer authentication and profile.
 *
 * Phone + OTP against the `User` collection. The account is created on the first
 * successful `verify-otp` — there is no separate signup call.
 *
 * ⚠️ Never call `/api/auth/*` or `/api/profile/*` from this app: those belong to
 * the worker app and verifying an OTP there creates a *Worker* record for the
 * phone number, dropping it into the worker onboarding pipeline. Both token
 * families are signed with the same secret and told apart by a `type` claim, so
 * the server rejects a crossover — but the two are kept in separate storage keys
 * so it cannot happen by accident.
 *
 * Bookings are not yet linked to the account: `POST /api/service-requests` still
 * takes `customerName`/`customerPhone` in the body and does not read this token.
 * The review screen fills those from the signed-in profile so the data lines up.
 */

import { getApiUrl } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'blocked';

/** Support contact block returned inside the profile. */
export interface SupportInfo {
  phone: string;
  email: string;
  hours: string;
}

/** Aggregated booking stats returned inside the profile. */
export interface UserStats {
  jobsCompleted: number;
  lifetimeSpend: number;
}

/** The full account, from `GET`/`PUT /api/user/profile`. */
export interface UserProfile {
  id: string;
  /** 10 digits, unformatted. This is what a booking sends as `customerPhone`. */
  phone: string;
  /** Pre-formatted `+91 98123 40077` — render this rather than formatting again. */
  phoneFormatted: string;
  phoneVerified: boolean;
  fullName: string | null;
  /** Uppercased first letter of the name, or `"?"` while the name is null. */
  displayInitial: string;
  /** `!!fullName`. The routing flag: false → name screen, true → home. */
  profileCompleted: boolean;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string;

  // ── Enriched fields (added by backend) ──────────────────────────────────────

  /** Spendable credits balance. Same ledger as GET /api/user/wallet. */
  credits: number;
  /** Currency code, e.g. "INR". */
  currency?: string;
  /**
   * Aggregated booking statistics. Populated by the server from all booking
   * types (instant, trial, scheduled). Survives reinstall.
   */
  stats?: UserStats;
  /**
   * The customer's personal referral code, e.g. "AKASH-K7A2".
   * Null in the rare mint-collision case — hide the share control when null.
   */
  referralCode?: string | null;
  /** Support contact info. Null while the server-side feature is rolling out. */
  support?: SupportInfo;
}

/** A coupon returned by `GET /api/user/coupons`. */
export interface ServerCoupon {
  code: string;
  title: string;
  detail: string;
  discount: number;
  minSubtotal: number;
}

/** Referral programme details from `GET /api/user/referral`. */
export interface ReferralInfo {
  referralCode: string;
  referrerReward: number;
  refereeReward: number;
  enabled: boolean;
  description: string;
}

/** An address returned by `GET /api/user/addresses`. */
export interface ServerAddress {
  id: string;
  label: string;
  locality: string;
  city: string;
  line: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

/** The compact user object returned alongside the token by `verify-otp`. */
export interface AuthUser {
  id: string;
  phone: string;
  fullName: string | null;
  profileCompleted: boolean;
  status: UserStatus;
}

export interface SendOtpResult {
  message: string;
  /** Drives the resend countdown. Env-configurable, so never hardcode 30. */
  cooldownSeconds: number;
}

export interface VerifyOtpResult {
  token: string;
  /** True when this call just created the account — for a welcome, not routing. */
  isNewUser: boolean;
  profileCompleted: boolean;
  user: AuthUser;
  message: string;
  /**
   * Present only when a referralCode was sent. applied=false is non-blocking —
   * the user is signed in regardless. Never block the login flow on this.
   */
  referral?: { applied: boolean; reason?: string };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * A failed API call. Carries the server's own `message`, which is written for
 * users and can be surfaced directly.
 *
 * Declared as an interface over `Error` rather than a subclass so `instanceof`
 * cannot break under transpilation — use `isApiError`.
 */
export interface ApiError extends Error {
  status: number;
  /** 401 — the session is dead. Wipe the token and return to login. */
  isAuthFailure: boolean;
  /** 403 — the account is blocked. Terminal: show support, never retry. */
  isBlocked: boolean;
  /** 400 — the OTP was never requested, already used, or has expired. */
  isOtpUnavailable: boolean;
  /** 429 — resend cooldown still running, seconds remaining if the server said. */
  retryAfterSeconds?: number;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof Error && typeof (err as ApiError).status === 'number';
}

/** Pulls "27" out of `Please wait 27s before requesting a new OTP`. */
function parseRetrySeconds(message: string): number | undefined {
  const match = /(\d+)\s*s/.exec(message);
  return match ? Number(match[1]) : undefined;
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function userRequest<T>(
  path: string,
  { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      // Exactly this prefix — the server slices the first 7 characters.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: (T & { success?: boolean; message?: string }) | null = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body (proxy page, empty 502) — handled by the throw below.
  }

  if (!res.ok || !payload?.success) {
    // A 5xx message is an internal detail; everything else is user-facing copy.
    const message =
      (res.status < 500 ? payload?.message : null) ?? 'Something went wrong. Please try again.';
    const error = new Error(message) as ApiError;
    error.status = res.status;
    error.isAuthFailure = res.status === 401;
    error.isBlocked = res.status === 403;
    error.isOtpUnavailable = res.status === 400;
    if (res.status === 429) error.retryAfterSeconds = parseRetrySeconds(message);
    throw error;
  }

  return payload as T;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Indian mobile: 10 digits starting 6–9. Matches the server's own rule. */
export const PHONE_PATTERN = /^[6-9]\d{9}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}

export const OTP_LENGTH = 6;
export const MAX_FULL_NAME = 60;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function sendOtp(phone: string): Promise<SendOtpResult> {
  const data = await userRequest<{ message: string; cooldownSeconds?: number }>(
    '/api/user/auth/send-otp',
    { method: 'POST', body: { phone } }
  );
  return { message: data.message, cooldownSeconds: data.cooldownSeconds ?? 30 };
}

/**
 * Resend. Identical contract to `sendOtp`, including the cooldown. A successful
 * resend replaces the previous code — the old one stops working.
 */
export async function resendOtp(phone: string): Promise<SendOtpResult> {
  const data = await userRequest<{ message: string; cooldownSeconds?: number }>(
    '/api/user/auth/resend-otp',
    { method: 'POST', body: { phone } }
  );
  return { message: data.message, cooldownSeconds: data.cooldownSeconds ?? 30 };
}

/**
 * Verifies the code, creating the account if the phone is new.
 *
 * A correct OTP is consumed immediately and cannot be replayed, so callers must
 * guard against double submission: a second call returns
 * `400 OTP expired or not requested` even though the first succeeded.
 *
 * `name` is optional — send it if it was collected on the login screen. A name
 * over 60 characters fails with 422 *without* consuming the OTP, so the user can
 * correct it and resubmit the same code.
 *
 * `referralCode` is optional. A bad code never fails the login — you get 200 with
 * `referral.applied: false`. Check the result and show a soft toast; never block.
 */
export async function verifyOtp(
  phone: string,
  otp: string,
  name?: string,
  referralCode?: string
): Promise<VerifyOtpResult> {
  const trimmedName = name?.trim();
  const trimmedCode = referralCode?.trim();
  return userRequest<VerifyOtpResult>('/api/user/auth/verify-otp', {
    method: 'POST',
    body: {
      phone,
      otp,
      ...(trimmedName ? { name: trimmedName } : {}),
      ...(trimmedCode ? { referralCode: trimmedCode } : {}),
    },
  });
}

/**
 * Revokes every token on the account (not just this device).
 * Used for the "sign out on all devices" / lost-phone case.
 * The regular sign-out is local-only and does not call this.
 */
export async function serverLogout(token: string): Promise<void> {
  await userRequest<{ signedOutAt: string; message: string }>('/api/user/auth/logout', {
    method: 'POST',
    token,
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/** Reads the account. Doubles as token validation on app launch. */
export async function getProfile(token: string): Promise<UserProfile> {
  const data = await userRequest<{ profile: UserProfile }>('/api/user/profile', { token });
  return data.profile;
}

/**
 * Sets or changes the name — the profile-setup screen and the edit-name screen
 * are the same call. Returns the updated profile, so no follow-up read is needed.
 * A name cannot be cleared once set; it is what the worker sees on every booking.
 */
export async function updateFullName(token: string, fullName: string): Promise<UserProfile> {
  const data = await userRequest<{ profile: UserProfile }>('/api/user/profile', {
    method: 'PUT',
    token,
    body: { fullName: fullName.trim() },
  });
  return data.profile;
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

/**
 * Fetches the personalised coupon list for this account.
 *
 * Do not cache across sessions — WELCOME150 disappears once the customer has paid
 * for anything, and a stale cache would show a coupon they can no longer use.
 * Refetch on screen focus.
 */
export async function getUserCoupons(token: string): Promise<ServerCoupon[]> {
  const data = await userRequest<{ coupons: ServerCoupon[] }>('/api/user/coupons', { token });
  return data.coupons ?? [];
}

// ─── Referral ─────────────────────────────────────────────────────────────────

/**
 * Loads full referral programme details for the Offers screen.
 *
 * The Account tab can use `profile.referralCode` directly (no extra call).
 * Call this only from the Offers/Coupons screen where you need reward amounts
 * and the server description copy.
 */
export async function getReferral(token: string): Promise<ReferralInfo> {
  const data = await userRequest<ReferralInfo>('/api/user/referral', { token });
  return data;
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export interface AddressListResponse {
  addresses: ServerAddress[];
  activeAddressId: string | null;
}

/** Fetches all saved addresses and the currently active one. */
export async function getUserAddresses(token: string): Promise<AddressListResponse> {
  const data = await userRequest<{ addresses: ServerAddress[]; activeAddressId: string | null }>(
    '/api/user/addresses',
    { token }
  );
  return { addresses: data.addresses ?? [], activeAddressId: data.activeAddressId ?? null };
}

export interface AddAddressBody {
  label?: string;
  locality?: string;
  city?: string;
  line?: string;
  lat: number;
  lng: number;
}

/** Saves a new address. The first one saved becomes active automatically. */
export async function addUserAddress(
  token: string,
  body: AddAddressBody
): Promise<AddressListResponse> {
  const data = await userRequest<{ addresses: ServerAddress[]; activeAddressId: string | null }>(
    '/api/user/addresses',
    { method: 'POST', token, body }
  );
  return { addresses: data.addresses ?? [], activeAddressId: data.activeAddressId ?? null };
}

/**
 * Removes an address. Deleting the active address promotes the newest survivor;
 * the response's `activeAddressId` tells you which one is now active.
 */
export async function deleteUserAddress(
  token: string,
  id: string
): Promise<AddressListResponse> {
  const data = await userRequest<{ addresses: ServerAddress[]; activeAddressId: string | null }>(
    `/api/user/addresses/${id}`,
    { method: 'DELETE', token }
  );
  return { addresses: data.addresses ?? [], activeAddressId: data.activeAddressId ?? null };
}

/** Marks an address as the active one. Server keeps at most one active per account. */
export async function selectUserAddress(
  token: string,
  id: string
): Promise<AddressListResponse> {
  const data = await userRequest<{ addresses: ServerAddress[]; activeAddressId: string | null }>(
    `/api/user/addresses/${id}/select`,
    { method: 'PUT', token }
  );
  return { addresses: data.addresses ?? [], activeAddressId: data.activeAddressId ?? null };
}
