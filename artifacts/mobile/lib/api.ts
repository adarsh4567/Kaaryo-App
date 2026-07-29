const DEFAULT_API_URL = 'http://localhost:4000';

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
}

export interface CreateRequestBody {
  customerName: string;
  customerPhone: string;
  category: string;
  subcategory?: string | null;
  jobDescription: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface CreateRequestResponse {
  success: boolean;
  message: string;
  request: ServiceRequest;
  workersNotified: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function createServiceRequest(
  body: CreateRequestBody
): Promise<CreateRequestResponse> {
  const res = await fetch(`${_apiUrl}/api/service-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to create request');
  }
  return data;
}

export async function getServiceRequest(id: string): Promise<ServiceRequest> {
  const res = await fetch(`${_apiUrl}/api/service-requests/${id}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Request not found');
  }
  return data.request;
}

export async function cancelServiceRequest(id: string): Promise<ServiceRequest> {
  const res = await fetch(`${_apiUrl}/api/service-requests/${id}/cancel`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to cancel request');
  }
  return data.request;
}

export async function getCities(): Promise<string[]> {
  const res = await fetch(`${_apiUrl}/api/places/cities`);
  const data = await res.json();
  return data.cities ?? [];
}

export async function getLocalitySuggestions(
  city: string,
  q: string
): Promise<string[]> {
  const res = await fetch(
    `${_apiUrl}/api/places/suggest?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q)}`
  );
  const data = await res.json();
  return data.suggestions ?? [];
}

// ─── Poller ───────────────────────────────────────────────────────────────────

export const TERMINAL_STATUSES: RequestStatus[] = [
  'completed',
  'cancelled',
  'expired',
];

const POLL_INTERVAL: Record<string, number> = {
  searching: 3000,
  in_progress: 10000,
  pending_rating: 15000,
};

export function trackRequest(
  baseUrl: string,
  requestId: string,
  onUpdate: (req: ServiceRequest) => void,
  onError?: (err: Error) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const url = baseUrl.replace(/\/$/, '');

  async function tick() {
    if (stopped) return;
    try {
      const res = await fetch(`${url}/api/service-requests/${requestId}`);
      const body = await res.json();
      if (!body.success) throw new Error(body.message || 'Request unavailable');
      onUpdate(body.request as ServiceRequest);
      if (TERMINAL_STATUSES.includes(body.request.status)) return stop();
      const interval = POLL_INTERVAL[body.request.status] ?? 10000;
      timer = setTimeout(tick, interval);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      timer = setTimeout(tick, 8000);
    }
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  }

  tick();
  return stop;
}
