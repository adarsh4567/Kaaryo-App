import { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { fetchServiceCatalog, type CatalogCategory } from '@/lib/userRequests';

/**
 * The server's rate card, fetched once and shared.
 *
 * Cached at module scope and keyed by API base URL: the catalog is small, changes
 * about never, and every instant booking sheet needs it before it can show a
 * price — refetching per sheet would put a spinner in front of a tap that should
 * feel instant. The URL key means switching servers from the Account screen does
 * not leave the old server's prices on screen.
 */
let cachedUrl: string | null = null;
let cached: CatalogCategory[] | null = null;
let inFlight: Promise<CatalogCategory[]> | null = null;

async function load(): Promise<CatalogCategory[]> {
  const url = getApiUrl();
  if (cached && cachedUrl === url) return cached;
  // A second caller during the first fetch joins it rather than starting another.
  if (inFlight && cachedUrl === url) return inFlight;

  cachedUrl = url;
  inFlight = fetchServiceCatalog()
    .then((services) => {
      cached = services;
      return services;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Drops the cache so the next read refetches. For a pull-to-refresh or retry. */
export function invalidateServiceCatalog() {
  cached = null;
  cachedUrl = null;
}

export interface ServiceCatalogState {
  categories: CatalogCategory[];
  isLoading: boolean;
  /** The server's own message, safe to show. Null while healthy. */
  error: string | null;
  reload: () => void;
}

export function useServiceCatalog(): ServiceCatalogState {
  const [categories, setCategories] = useState<CatalogCategory[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!cached) setIsLoading(true);

    load()
      .then((services) => {
        if (cancelled) return;
        setCategories(services);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the service list.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    invalidateServiceCatalog();
    setAttempt((n) => n + 1);
  }, []);

  return { categories, isLoading, error, reload };
}

/** Looks a category up by the key `getRemoteCategory` returns. */
export function findCategory(
  categories: CatalogCategory[],
  key: string | undefined
): CatalogCategory | undefined {
  if (!key) return undefined;
  return categories.find((c) => c.key === key);
}
