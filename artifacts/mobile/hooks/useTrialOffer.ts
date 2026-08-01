import { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { fetchTrialOffer, type TrialOffer } from '@/lib/userTrials';

/**
 * The discounted-trial offer, fetched lazily and shared.
 *
 * Cached at module scope and keyed by token + API base URL. The offer answers
 * "should this customer see the trial option at all, and what does it say?" in
 * one call, and the answer only changes when the customer books, pays or cancels
 * — so a sheet that opens twice should not put a spinner in front of a choice
 * that was already loaded.
 *
 * Keyed on the token because `used` / `allowance` / `liveTrialId` are per-account:
 * signing in as somebody else must not inherit the previous account's allowance.
 */
let cachedKey: string | null = null;
let cached: TrialOffer | null = null;
let inFlight: Promise<TrialOffer> | null = null;

function keyFor(token: string): string {
  return `${getApiUrl()}::${token}`;
}

async function load(token: string): Promise<TrialOffer> {
  const key = keyFor(token);
  if (cached && cachedKey === key) return cached;
  if (inFlight && cachedKey === key) return inFlight;

  cachedKey = key;
  inFlight = fetchTrialOffer(token)
    .then((offer) => {
      cached = offer;
      return offer;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Drops the cache so the next read refetches.
 *
 * Call this after anything that moves the account's allowance or live trial:
 * booking one, cancelling one, or finishing one. Otherwise the sheet keeps
 * offering a trial the server will refuse.
 */
export function invalidateTrialOffer() {
  cached = null;
  cachedKey = null;
}

export interface TrialOfferState {
  /** Null while loading, or when the request failed. */
  offer: TrialOffer | null;
  isLoading: boolean;
  /** The server's own message, safe to show. Null while healthy. */
  error: string | null;
  reload: () => void;
}

/**
 * Reads the offer for the signed-in customer.
 *
 * `enabled` exists because the only caller that matters is the instant booking
 * sheet, which should not spend a request on a service the trial cannot cover —
 * trials are cleaning-only, and there is no electrical or plumbing trial to book.
 */
export function useTrialOffer(token: string | null, enabled = true): TrialOfferState {
  // Seeded from the cache only when it belongs to *this* account and server —
  // otherwise the first frame would show the previous account's allowance.
  const hit = token && cached && cachedKey === keyFor(token) ? cached : null;
  const [offer, setOffer] = useState<TrialOffer | null>(hit);
  const [isLoading, setIsLoading] = useState(!!token && enabled && !hit);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;

    const key = keyFor(token);
    if (cached && cachedKey === key) {
      setOffer(cached);
      setError(null);
      setIsLoading(false);
      return;
    }

    // A cache miss means whatever is on screen belongs to another account or
    // another server, so it is dropped rather than left up during the fetch.
    setOffer(null);
    setIsLoading(true);
    setError(null);
    load(token)
      .then((next) => {
        if (cancelled) return;
        setOffer(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed offer read is not fatal: the caller falls back to hiding the
        // trial option, which leaves the normal booking path untouched.
        setOffer(null);
        setError(err instanceof Error ? err.message : 'Could not load the trial offer.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, enabled, attempt]);

  const reload = useCallback(() => {
    invalidateTrialOffer();
    setAttempt((n) => n + 1);
  }, []);

  return { offer, isLoading, error, reload };
}
