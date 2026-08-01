/**
 * Where the app looks for the API before anything is saved on the device.
 *
 * `localhost` is only correct for the web build and a simulator — on a physical
 * phone it resolves to the phone itself, so a device install with empty storage
 * cannot reach anything and every call fails as "Network request failed". Setting
 * `EXPO_PUBLIC_API_URL` (in `.env`, or inline before the Expo command) bakes the
 * real address into the bundle so a fresh install works on first launch.
 *
 * Expo inlines `EXPO_PUBLIC_*` at bundle time, so this is a build-time constant —
 * changing `.env` requires restarting the bundler, not just reloading the app.
 */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';

let _apiUrl = DEFAULT_API_URL;

export function setApiUrl(url: string) {
  _apiUrl = url.replace(/\/$/, '');
}

export function getApiUrl(): string {
  return _apiUrl;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestStatus =
  | 'searching'
  | 'in_progress'
  | 'pending_rating'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface Worker {
  id: string;
  name: string;
  phone: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
}

export interface ServiceRequest {
  id: string;
  status: RequestStatus;
  category: string;
  subcategory?: string;
  jobDescription: string;
  totalPrice: number;
  currency: string;
  address: string;
  location: { type: string; coordinates: [number, number] };
  radiusKm: number;
  wave: number;
  workersNotified: number;
  createdAt: string;
  worker?: Worker;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  /**
   * Start code the customer reads out to the expert. Only rendered when the
   * backend issues one — the app never fabricates it.
   */
  otp?: string;
}

/** One line of a multi-task booking. */
export interface RequestItem {
  serviceKey: string;
  serviceName: string;
  durationKey: string;
  durationLabel: string;
  quantity: number;
  unitPrice: number;
  minutes: number;
}

export interface CreateRequestBody {
  customerName: string;
  customerPhone: string;
  /** Primary service key — the first task in the cart. */
  category: string;
  subcategory?: string | null;
  jobDescription: string;
  lat: number;
  lng: number;
  address?: string;
  /**
   * Full cart. Additive to the original contract: backends that only understand
   * `category` + `jobDescription` ignore these fields.
   */
  items?: RequestItem[];
  mode?: 'instant' | 'schedule';
  /** Slot label for scheduled bookings. */
  scheduledFor?: string | null;
  /** Amount quoted at checkout, in rupees. */
  quotedTotal?: number;
  estimatedMinutes?: number;
}

export interface CreateRequestResponse {
  success: boolean;
  message: string;
  request: ServiceRequest;
  workersNotified: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Reads the flat `{ success, message, ...payload }` envelope every endpoint
 * returns.
 *
 * A malformed request id currently surfaces as a 500 carrying a Mongo CastError
 * message, so any 5xx is normalised into the caller's fallback rather than
 * leaking server internals into the UI. 4xx messages are written for users and
 * pass through unchanged.
 */
async function request<T>(
  path: string,
  init?: RequestInit,
  fallback = 'Request failed'
): Promise<T> {
  const res = await fetch(`${_apiUrl}${path}`, init);

  let body: (T & { success?: boolean; message?: string }) | null = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (proxy error page, empty 502) — fall through to the throw.
  }

  if (!res.ok || !body?.success) {
    const serverMessage = res.status >= 500 ? null : body?.message;
    throw new Error(serverMessage || fallback);
  }
  return body as T;
}

export async function createServiceRequest(
  body: CreateRequestBody
): Promise<CreateRequestResponse> {
  return request<CreateRequestResponse>(
    '/api/service-requests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Could not place the booking. Check the API URL in Account.'
  );
}

export async function getServiceRequest(id: string): Promise<ServiceRequest> {
  const data = await request<{ request: ServiceRequest }>(
    `/api/service-requests/${id}`,
    undefined,
    'This booking is unavailable'
  );
  return data.request;
}

export async function cancelServiceRequest(id: string): Promise<ServiceRequest> {
  const data = await request<{ request: ServiceRequest }>(
    `/api/service-requests/${id}/cancel`,
    { method: 'POST' },
    'Could not cancel this booking'
  );
  return data.request;
}

export async function getCities(): Promise<string[]> {
  const data = await request<{ cities: string[] }>(
    '/api/places/cities',
    undefined,
    'Could not load cities'
  );
  return data.cities ?? [];
}

/**
 * Locality autosuggest. Returns names only — no coordinates — so it can drive a
 * city/locality picker but never the `lat`/`lng` a booking requires.
 */
export async function getLocalitySuggestions(
  city: string,
  q: string
): Promise<string[]> {
  const data = await request<{ suggestions: string[] }>(
    `/api/places/suggest?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q)}`,
    undefined,
    'Could not load localities'
  );
  return data.suggestions ?? [];
}

// ─── Poller ───────────────────────────────────────────────────────────────────

export const TERMINAL_STATUSES: RequestStatus[] = [
  'completed',
  'cancelled',
  'expired',
];

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

const POLL_INTERVAL: Record<string, number> = {
  searching: 3000,
  in_progress: 10000,
  pending_rating: 15000,
};

/** Backoff after a network failure — slower than any healthy interval. */
const ERROR_INTERVAL = 8000;

/**
 * In an empty area the server expires a request at ~120–125 s: waves fire at
 * 0/30/60/90/120 s and the final 15 km wave expires immediately on finding nobody
 * rather than waiting out another timeout. This ceiling leaves generous headroom
 * over that, so in practice the server always settles the status first and this
 * only guards against polling a request forever.
 */
const SEARCHING_CEILING = 240_000;

/**
 * Polls a request until it reaches a terminal status, then stops.
 *
 * Returns its own stop function. Callers must invoke it on unmount and when
 * backgrounding — a live timer in the background wastes battery and the app will
 * re-fetch on foreground anyway.
 */
export function trackRequest(
  baseUrl: string,
  requestId: string,
  onUpdate: (req: ServiceRequest) => void,
  onError?: (err: Error) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let searchingSince: number | null = null;
  const url = baseUrl.replace(/\/$/, '');

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function tick() {
    if (stopped) return;
    try {
      const res = await fetch(`${url}/api/service-requests/${requestId}`);
      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(res.status >= 500 ? 'This booking is unavailable' : body?.message);
      }

      const next = body.request as ServiceRequest;
      onUpdate(next);
      if (isTerminal(next.status)) return stop();

      // The server is the only authority on status, so the app never infers a
      // timeout locally — it just stops asking and trusts the last answer.
      if (next.status === 'searching') {
        searchingSince ??= Date.now();
        if (Date.now() - searchingSince > SEARCHING_CEILING) return stop();
      } else {
        searchingSince = null;
      }

      timer = setTimeout(tick, POLL_INTERVAL[next.status] ?? 10000);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      timer = setTimeout(tick, ERROR_INTERVAL);
    }
  }

  tick();
  return stop;
}
