import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import { DEFAULT_API_URL, setApiUrl } from '@/lib/api';
import { setThemeOverride } from '@/hooks/useColors';
import {
  BUNDLES,
  getServiceByKey,
  type Coupon,
  type DurationOption,
  type Service,
} from '@/lib/catalog';
import { clearToken, loadToken, saveToken } from '@/lib/tokenStore';
import {
  addUserAddress,
  deleteUserAddress,
  getProfile,
  getUserAddresses,
  getUserCoupons,
  isApiError,
  selectUserAddress,
  serverLogout as apiServerLogout,
  updateFullName,
  type ServerAddress,
  type ServerCoupon,
  type UserProfile,
} from '@/lib/userAuth';
import {
  isLiveRequest,
  isRequestApiError,
  listUserRequests,
  type UserRequest,
} from '@/lib/userRequests';
import {
  isLiveTrial,
  isTrialApiError,
  listTrials,
  type Trial,
  type TrialSummary,
} from '@/lib/userTrials';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The identity fields a booking needs, projected off the verified profile.
 *
 * Kept as its own shape because the cart and checkout screens only ever want a
 * name and a number — they should not have to know about tokens or profile
 * completion. Derived, never stored: the server's profile is the only source of
 * truth for who the user is.
 */
export interface UserInfo {
  name: string;
  phone: string;
}

export interface Address {
  id: string;
  /** Short tag shown in the header: "home", "work", "mom's place". */
  label: string;
  locality: string;
  city: string;
  /** House / flat / street detail. */
  line: string;
  lat?: number;
  lng?: number;
}

/** How the booking is dispatched. Instant targets a 10-minute arrival. */
export type BookingMode = 'instant' | 'schedule';

export interface CartItem {
  /** `${serviceKey}:${durationKey}` — a service at a specific duration. */
  id: string;
  serviceKey: string;
  durationKey: string;
  quantity: number;
}

/** A cart item joined with its catalog entry, ready to render. */
export interface CartLine extends CartItem {
  service: Service;
  duration: DurationOption;
  lineTotal: number;
  lineMinutes: number;
}

export interface HistoryEntry {
  id: string;
  /** Human-readable summary, e.g. "Sweeping & mopping + 2 more". */
  title: string;
  serviceKeys: string[];
  itemCount: number;
  total: number;
  minutes: number;
  mode: BookingMode;
  /** Slot label for scheduled bookings, e.g. "Tomorrow, 9:00 AM". */
  slot?: string;
  createdAt: string;
  status: string;
}

interface AppContextValue {
  // Identity
  /** The verified account. Null means signed out — this is the auth gate's flag. */
  profile: UserProfile | null;
  /**
   * The bearer token for `/api/user/*`. Exposed because the instant booking flow
   * calls those endpoints directly from its screens; nothing else should read it.
   */
  token: string | null;
  /** Name and phone for bookings, projected off `profile`. */
  user: UserInfo | null;
  /**
   * True while the stored token is being checked on launch. The gate must wait
   * for this, or a signed-in user sees the login screen flash on every cold start.
   */
  isRestoringSession: boolean;
  /** Kept as an alias of `isRestoringSession` for screens that read a spinner flag. */
  isLoadingUser: boolean;
  /** 403 — the account is blocked. Terminal: signing in again returns another 403. */
  isBlocked: boolean;
  signIn: (token: string, profile: UserProfile) => Promise<void>;
  setFullName: (fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Revokes every token on the account server-side (lost phone / stolen device).
   * Also calls the local signOut so the app clears state and routes to login.
   */
  serverSignOut: () => Promise<void>;

  // Address book
  addresses: Address[];
  activeAddress: Address | null;
  addAddress: (address: Omit<Address, 'id'>) => Promise<Address>;
  selectAddress: (id: string) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;

  // Cart
  cart: CartItem[];
  cartLines: CartLine[];
  itemCount: number;
  subtotal: number;
  totalMinutes: number;
  addToCart: (serviceKey: string, durationKey?: string) => void;
  addBundleToCart: (bundleKey: string) => void;
  incrementItem: (id: string) => void;
  decrementItem: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => Promise<void>;
  quantityForService: (serviceKey: string) => number;

  // Checkout
  mode: BookingMode;
  setMode: (mode: BookingMode) => void;
  scheduledSlot: string | null;
  setScheduledSlot: (slot: string | null) => void;
  couponCode: string | null;
  applyCoupon: (code: string | null) => void;
  appliedCoupon: Coupon | null;
  discount: number;
  total: number;

  // Wallet — credits now come from profile.credits (same ledger as /api/user/wallet)
  credits: number;

  // Coupons (server-side, personalised)
  /** Personalised coupon list from GET /api/user/coupons. Empty until first fetch. */
  serverCoupons: ServerCoupon[];
  isLoadingCoupons: boolean;
  /** Refresh the coupon list. Call on Offers/Coupons screen focus. */
  refreshCoupons: () => Promise<void>;

  // Bookings — scheduled, placed against the legacy endpoint and stored on device
  history: HistoryEntry[];
  addToHistory: (entry: HistoryEntry) => Promise<void>;
  updateHistoryStatus: (id: string, status: string) => Promise<void>;

  /**
   * Instant bookings, owned by the server.
   *
   * These are not cached to disk: unlike the scheduled entries above, the server
   * is the only authority on a live request's status, countdown and payment
   * state, and a stale copy of any of those would be worse than a spinner.
   */
  serviceRequests: UserRequest[];
  /** Still wanting attention — searching, running, or finished but unpaid. */
  liveRequests: UserRequest[];
  pastRequests: UserRequest[];
  /** The one request a customer may have in flight, or null. */
  activeRequest: UserRequest | null;
  isLoadingRequests: boolean;
  refreshRequests: () => Promise<void>;
  /** Folds in a request a screen already holds, from a create/cancel/pay reply. */
  mergeRequest: (request: UserRequest) => void;

  /**
   * Discounted trial bookings, owned by the server.
   *
   * Kept apart from `serviceRequests` rather than merged into it, because a trial
   * is a different resource with a different status set — `assigned` instead of
   * `searching`, no `pending_rating` — and a list that flattened the two would
   * have to un-flatten them again at every branch. The bookings screen normalises
   * both into its own row shape instead.
   *
   * Split into full objects and history summaries because the server sends two
   * shapes: `active` rows carry the whole trial, history rows are compact and
   * have no worker, description or payment object.
   */
  activeTrials: Trial[];
  trialHistory: TrialSummary[];
  /** Still wanting attention — searching, running, unpaid, or unrated. */
  liveTrials: Trial[];
  /** The one trial a customer may have in flight, or null. */
  activeTrial: Trial | null;
  isLoadingTrials: boolean;
  refreshTrials: () => Promise<void>;
  /** Folds in a trial a screen already holds, from a create/cancel/pay reply. */
  mergeTrial: (trial: Trial) => void;

  // Theme
  /** The active resolved scheme — true means dark. */
  isDark: boolean;
  /** Cycle through dark → light (or light → dark) and persist the choice. */
  toggleTheme: () => void;

  // Backend
  apiUrl: string;
  saveApiUrl: (url: string) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Storage keys are namespaced `v2` because the cart, address book and booking
 * shapes changed — `v1` payloads would hydrate into unrenderable state.
 */
const STORAGE_PROFILE = '@kaaryo/v2/profile';
const STORAGE_HISTORY = '@kaaryo/v2/history';
const STORAGE_CART = '@kaaryo/v2/cart';
const STORAGE_ADDRESSES = '@kaaryo/v2/addresses';
const STORAGE_ACTIVE_ADDRESS = '@kaaryo/v2/activeAddress';
const STORAGE_API_URL = '@kaaryo/v2/apiUrl';
const STORAGE_THEME = '@kaaryo/v2/theme';

/**
 * The category-flow build wrote the API URL under a `v3` prefix, so a device that
 * was signed in against a working server has its address filed under a key this
 * build does not read. Unlike the cart and profile payloads, the URL is a plain
 * string whose shape never changed — so it is recovered rather than stranded.
 * Without this the app silently falls back to `localhost`, where a physical
 * device can reach nothing, and sign-in becomes impossible.
 */
const STORAGE_API_URL_V3 = '@kaaryo/v3/apiUrl';


/** Flat convenience fee, shown as its own line so the total never surprises. */
export const PLATFORM_FEE = 19;

/**
 * How often the live instant request is re-read while one is in flight.
 *
 * Deliberately slower than the 2.5s the dispatch screen polls at: this one only
 * has to keep the tab badge and the home strip honest, while that one is driving
 * a visible countdown.
 */
const LIVE_POLL_MS = 6000;

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [serviceRequests, setServiceRequests] = useState<UserRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [activeTrials, setActiveTrials] = useState<Trial[]>([]);
  const [trialHistory, setTrialHistory] = useState<TrialSummary[]>([]);
  const [isLoadingTrials, setIsLoadingTrials] = useState(false);
  const [serverCoupons, setServerCoupons] = useState<ServerCoupon[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [mode, setMode] = useState<BookingMode>('instant');
  const [scheduledSlot, setScheduledSlot] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);
  /** null = follow system; 'light' | 'dark' = explicit user override. */
  const [themeOverride, setThemeOverride_] = useState<'light' | 'dark' | null>(null);
  const systemScheme = useColorScheme();
  const isDark = themeOverride != null ? themeOverride === 'dark' : systemScheme === 'dark';

  // Keep the module-level singleton in useColors in sync.
  useEffect(() => { setThemeOverride(themeOverride); }, [themeOverride]);

  // ── Hydration ──────────────────────────────────────────────────────────────

  /**
   * Restores the session on launch.
   *
   * The cached profile is shown immediately so the app never flashes a login
   * screen at a signed-in user, then `GET /api/user/profile` revalidates the token
   * in the background. Only a 401 clears the session — a network failure has to
   * leave the user signed in, or losing signal would log them out.
   */
  useEffect(() => {
    async function hydrate() {
      let restoredToken: string | null = null;
      try {
        const [
          rawProfile,
          rawHistory,
          rawCart,
          rawAddresses,
          rawActive,
          rawApiUrl,
          rawApiUrlV3,
          rawTheme,
          storedToken,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_PROFILE),
          AsyncStorage.getItem(STORAGE_HISTORY),
          AsyncStorage.getItem(STORAGE_CART),
          AsyncStorage.getItem(STORAGE_ADDRESSES),
          AsyncStorage.getItem(STORAGE_ACTIVE_ADDRESS),
          AsyncStorage.getItem(STORAGE_API_URL),
          AsyncStorage.getItem(STORAGE_API_URL_V3),
          AsyncStorage.getItem(STORAGE_THEME),
          loadToken(),
        ]);

        // The API base URL must be applied before any request goes out — the
        // session check below is the first thing that needs it.
        const url = rawApiUrl ?? rawApiUrlV3 ?? DEFAULT_API_URL;
        setApiUrlState(url);
        setApiUrl(url);
        // Promote a recovered v3 address so this is a one-time migration.
        if (!rawApiUrl && rawApiUrlV3) {
          await AsyncStorage.setItem(STORAGE_API_URL, rawApiUrlV3);
        }

        if (rawHistory) setHistory(JSON.parse(rawHistory));
        if (rawCart) setCart(JSON.parse(rawCart));
        if (rawAddresses) setAddresses(JSON.parse(rawAddresses));
        if (rawActive) setActiveAddressId(rawActive);
        if (rawTheme === 'light' || rawTheme === 'dark') setThemeOverride_(rawTheme);

        restoredToken = storedToken;
        if (storedToken) {
          setToken(storedToken);
          if (rawProfile) setProfile(JSON.parse(rawProfile));
        }
      } catch {
        // A corrupt cache should not block the app — start from defaults.
      }

      if (!restoredToken) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const fresh = await getProfile(restoredToken);
        setProfile(fresh);
        setIsBlocked(fresh.status === 'blocked');
        await AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(fresh));
      } catch (err) {
        if (isApiError(err) && err.isAuthFailure) {
          // Dead token: 30 days elapsed, or the account no longer exists.
          await clearToken();
          setToken(null);
          setProfile(null);
          await AsyncStorage.removeItem(STORAGE_PROFILE);
        } else if (isApiError(err) && err.isBlocked) {
          setIsBlocked(true);
        }
        // Anything else (offline, 5xx) keeps the cached profile in place.
      } finally {
        setIsRestoringSession(false);
      }
    }
    hydrate();
  }, []);

  // ── Identity ───────────────────────────────────────────────────────────────

  const signIn = useCallback(async (nextToken: string, nextProfile: UserProfile) => {
    setToken(nextToken);
    setProfile(nextProfile);
    setIsBlocked(nextProfile.status === 'blocked');
    await Promise.all([
      saveToken(nextToken),
      AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(nextProfile)),
    ]);
  }, []);

  /**
   * Signs out locally. The cart, addresses and booking ids are device-local, so
   * they go too. For a server-side revoke (lost phone), call `serverSignOut`.
   */
  const signOut = useCallback(async () => {
    setToken(null);
    setProfile(null);
    setIsBlocked(false);
    setCart([]);
    setHistory([]);
    setServiceRequests([]);
    setActiveTrials([]);
    setTrialHistory([]);
    setAddresses([]);
    setActiveAddressId(null);
    setCouponCode(null);
    setServerCoupons([]);
    await Promise.all([
      clearToken(),
      AsyncStorage.multiRemove([
        STORAGE_PROFILE,
        STORAGE_HISTORY,
        STORAGE_CART,
        STORAGE_ADDRESSES,
        STORAGE_ACTIVE_ADDRESS,
      ]),
    ]);
  }, []);

  /**
   * Revokes all tokens on the account server-side (lost/stolen phone), then
   * performs the normal local sign-out so the app returns to the login screen.
   * Any old token from another device will get a 401 from that point on.
   */
  const serverSignOut = useCallback(async () => {
    // Best-effort: if the network call fails, still sign out locally.
    if (token) {
      try {
        await apiServerLogout(token);
      } catch {
        // Ignore — the local sign-out below is what matters for this device.
      }
    }
    await signOut();
  }, [token, signOut]);

  /**
   * Sets or renames the account holder. Throws on validation failure so the
   * calling screen can show the server's own message inline.
   */
  const setFullName = useCallback(
    async (fullName: string) => {
      if (!token) throw new Error('You are signed out. Please sign in again.');
      try {
        const updated = await updateFullName(token, fullName);
        setProfile(updated);
        await AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(updated));
      } catch (err) {
        if (isApiError(err) && err.isAuthFailure) await signOut();
        throw err;
      }
    },
    [token, signOut]
  );

  /**
   * Name and phone for the checkout payload. Derived so a booking always carries
   * the *verified* identity rather than anything typed into a local form.
   */
  const user = useMemo<UserInfo | null>(
    () => (profile ? { name: profile.fullName ?? '', phone: profile.phone } : null),
    [profile]
  );

  // ── Address book ───────────────────────────────────────────────────────────

  /**
   * Applies a server address list response to local state + AsyncStorage.
   * Converts ServerAddress → Address (same shape; id is now a server ObjectId).
   */
  const applyServerAddresses = useCallback(
    async (serverList: ServerAddress[], serverActiveId: string | null) => {
      const converted: Address[] = serverList.map((a) => ({
        id: a.id,
        label: a.label,
        locality: a.locality,
        city: a.city,
        line: a.line,
        lat: a.lat,
        lng: a.lng,
      }));
      setAddresses(converted);
      setActiveAddressId(serverActiveId);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_ADDRESSES, JSON.stringify(converted)),
        serverActiveId
          ? AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, serverActiveId)
          : AsyncStorage.removeItem(STORAGE_ACTIVE_ADDRESS),
      ]);
    },
    []
  );

  const addAddress = useCallback(
    async (input: Omit<Address, 'id'>) => {
      if (token) {
        try {
          // Server requires lat/lng; if not provided fall back to 0,0 (offline add
          // will still be saved locally and synced on next successful call).
          const { addresses: serverList, activeAddressId: serverActive } = await addUserAddress(
            token,
            {
              label: input.label,
              locality: input.locality,
              city: input.city,
              line: input.line,
              lat: input.lat ?? 0,
              lng: input.lng ?? 0,
            }
          );
          await applyServerAddresses(serverList, serverActive);
          // Return the new address that the server just created.
          const created = serverList.find((a) => a.isActive) ?? serverList[0];
          if (created) {
            return {
              id: created.id,
              label: created.label,
              locality: created.locality,
              city: created.city,
              line: created.line,
              lat: created.lat,
              lng: created.lng,
            } satisfies Address;
          }
        } catch {
          // Fall through to local-only path so the address is not lost offline.
        }
      }
      // Local-only fallback (offline or no token).
      const created: Address = { ...input, id: `addr_${Date.now()}` };
      const next = [created, ...addresses];
      setAddresses(next);
      setActiveAddressId(created.id);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_ADDRESSES, JSON.stringify(next)),
        AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, created.id),
      ]);
      return created;
    },
    [token, addresses, applyServerAddresses]
  );

  const selectAddress = useCallback(
    async (id: string) => {
      // Optimistic local update first so the UI responds immediately.
      setActiveAddressId(id);
      await AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, id);
      if (token) {
        try {
          const { addresses: serverList, activeAddressId: serverActive } =
            await selectUserAddress(token, id);
          await applyServerAddresses(serverList, serverActive);
        } catch {
          // Keep the optimistic update on failure.
        }
      }
    },
    [token, applyServerAddresses]
  );

  const removeAddress = useCallback(
    async (id: string) => {
      if (token) {
        try {
          const { addresses: serverList, activeAddressId: serverActive } =
            await deleteUserAddress(token, id);
          await applyServerAddresses(serverList, serverActive);
          return;
        } catch {
          // Fall through to local-only removal.
        }
      }
      // Local-only fallback.
      const next = addresses.filter((a) => a.id !== id);
      setAddresses(next);
      await AsyncStorage.setItem(STORAGE_ADDRESSES, JSON.stringify(next));
      if (activeAddressId === id) {
        const fallback = next[0]?.id ?? null;
        setActiveAddressId(fallback);
        if (fallback) await AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, fallback);
        else await AsyncStorage.removeItem(STORAGE_ACTIVE_ADDRESS);
      }
    },
    [token, addresses, activeAddressId, applyServerAddresses]
  );

  const activeAddress = useMemo(
    () => addresses.find((a) => a.id === activeAddressId) ?? addresses[0] ?? null,
    [addresses, activeAddressId]
  );

  // ── Cart ───────────────────────────────────────────────────────────────────

  /** Every mutation writes through to storage so a cold start keeps the cart. */
  const mutateCart = useCallback((update: (prev: CartItem[]) => CartItem[]) => {
    setCart((prev) => {
      const next = update(prev);
      AsyncStorage.setItem(STORAGE_CART, JSON.stringify(next));
      return next;
    });
  }, []);

  const addToCart = useCallback(
    (serviceKey: string, durationKey?: string) => {
      const service = getServiceByKey(serviceKey);
      if (!service) return;
      const duration = durationKey
        ? (service.durations.find((d) => d.key === durationKey) ?? service.durations[0])
        : service.durations[0];
      const id = `${serviceKey}:${duration.key}`;
      mutateCart((prev) => {
        const existing = prev.find((i) => i.id === id);
        if (existing) {
          return prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i));
        }
        return [...prev, { id, serviceKey, durationKey: duration.key, quantity: 1 }];
      });
    },
    [mutateCart]
  );

  const addBundleToCart = useCallback(
    (bundleKey: string) => {
      const bundle = BUNDLES.find((b) => b.key === bundleKey);
      if (!bundle) return;
      mutateCart((prev) => {
        let next = prev;
        for (const serviceKey of bundle.serviceKeys) {
          const service = getServiceByKey(serviceKey);
          if (!service) continue;
          const duration = service.durations[0];
          const id = `${serviceKey}:${duration.key}`;
          const existing = next.find((i) => i.id === id);
          next = existing
            ? next.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
            : [...next, { id, serviceKey, durationKey: duration.key, quantity: 1 }];
        }
        return next;
      });
    },
    [mutateCart]
  );

  const incrementItem = useCallback(
    (id: string) => {
      mutateCart((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
      );
    },
    [mutateCart]
  );

  /** Dropping below one unit removes the line entirely. */
  const decrementItem = useCallback(
    (id: string) => {
      mutateCart((prev) =>
        prev.flatMap((i) => {
          if (i.id !== id) return [i];
          return i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : [];
        })
      );
    },
    [mutateCart]
  );

  const removeFromCart = useCallback(
    (id: string) => {
      mutateCart((prev) => prev.filter((i) => i.id !== id));
    },
    [mutateCart]
  );

  const clearCart = useCallback(async () => {
    setCart([]);
    setCouponCode(null);
    await AsyncStorage.removeItem(STORAGE_CART);
  }, []);

  /**
   * Cart items joined with the catalog. Items whose service no longer exists are
   * dropped rather than rendered as blanks.
   */
  const cartLines = useMemo<CartLine[]>(() => {
    return cart.flatMap((item) => {
      const service = getServiceByKey(item.serviceKey);
      if (!service) return [];
      const duration =
        service.durations.find((d) => d.key === item.durationKey) ?? service.durations[0];
      return [
        {
          ...item,
          service,
          duration,
          lineTotal: duration.price * item.quantity,
          lineMinutes: duration.minutes * item.quantity,
        },
      ];
    });
  }, [cart]);

  const itemCount = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.quantity, 0),
    [cartLines]
  );
  const subtotal = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.lineTotal, 0),
    [cartLines]
  );
  const totalMinutes = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.lineMinutes, 0),
    [cartLines]
  );

  const quantityForService = useCallback(
    (serviceKey: string) =>
      cart.reduce((sum, i) => (i.serviceKey === serviceKey ? sum + i.quantity : sum), 0),
    [cart]
  );

  // ── Checkout maths ─────────────────────────────────────────────────────────

  const appliedCoupon = useMemo(() => {
    if (!couponCode) return null;
    // Look up from the server coupon list; fall back to an empty match.
    const serverCoupon = serverCoupons.find((c) => c.code === couponCode);
    if (!serverCoupon || subtotal < serverCoupon.minSubtotal) return null;
    // Shape the ServerCoupon into the Coupon type that the rest of the app expects.
    return serverCoupon as unknown as Coupon;
  }, [couponCode, subtotal, serverCoupons]);

  const discount = appliedCoupon?.discount ?? 0;
  const total = useMemo(
    () => (subtotal === 0 ? 0 : Math.max(0, subtotal - discount) + PLATFORM_FEE),
    [subtotal, discount]
  );

  const applyCoupon = useCallback((code: string | null) => setCouponCode(code), []);

  // ── Coupons (server-side) ──────────────────────────────────────────────────

  const refreshCoupons = useCallback(async () => {
    if (!token) {
      setServerCoupons([]);
      return;
    }
    setIsLoadingCoupons(true);
    try {
      const coupons = await getUserCoupons(token);
      setServerCoupons(coupons);
    } catch {
      // Offline or 5xx — keep whatever is already shown.
    } finally {
      setIsLoadingCoupons(false);
    }
  }, [token]);

  // ── Bookings ───────────────────────────────────────────────────────────────

  const addToHistory = useCallback(async (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)];
      AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateHistoryStatus = useCallback(async (id: string, status: string) => {
    setHistory((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, status } : e));
      AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Instant bookings (server-owned) ────────────────────────────────────────

  const refreshRequests = useCallback(async () => {
    if (!token) {
      setServiceRequests([]);
      return;
    }
    setIsLoadingRequests(true);
    try {
      const { active, history: past } = await listUserRequests(token);
      // `active` first so the live request leads the list; the server already
      // returns history newest-first.
      setServiceRequests([...active, ...past]);
    } catch (err) {
      if (isRequestApiError(err) && err.isAuthFailure) await signOut();
      // Anything else (offline, 5xx) keeps whatever is already on screen.
    } finally {
      setIsLoadingRequests(false);
    }
  }, [token, signOut]);

  const mergeRequest = useCallback((request: UserRequest) => {
    setServiceRequests((prev) =>
      prev.some((r) => r.id === request.id)
        ? prev.map((r) => (r.id === request.id ? request : r))
        : [request, ...prev]
    );
  }, []);

  const liveRequests = useMemo(() => serviceRequests.filter(isLiveRequest), [serviceRequests]);
  const pastRequests = useMemo(
    () => serviceRequests.filter((r) => !isLiveRequest(r)),
    [serviceRequests]
  );
  const activeRequest = liveRequests[0] ?? null;

  // ── Discounted trials (server-owned) ───────────────────────────────────────

  const refreshTrials = useCallback(async () => {
    if (!token) {
      setActiveTrials([]);
      setTrialHistory([]);
      return;
    }
    setIsLoadingTrials(true);
    try {
      const { active, history: past } = await listTrials(token);
      setActiveTrials(active);
      setTrialHistory(past);
    } catch (err) {
      if (isTrialApiError(err) && err.isAuthFailure) await signOut();
      // Anything else (offline, 5xx, or a backend without the trial routes yet)
      // keeps whatever is already on screen. A missing trial API must never take
      // the bookings tab down with it.
    } finally {
      setIsLoadingTrials(false);
    }
  }, [token, signOut]);

  /**
   * Folds in a trial a screen already holds.
   *
   * A trial that has settled drops out of `active` on the next read, so this only
   * updates what is there and adds what is not — it does not try to move rows
   * between the two lists, which is the server's call.
   */
  const mergeTrial = useCallback((trial: Trial) => {
    setActiveTrials((prev) =>
      prev.some((t) => t.id === trial.id)
        ? prev.map((t) => (t.id === trial.id ? trial : t))
        : [trial, ...prev]
    );
  }, []);

  const liveTrials = useMemo(() => activeTrials.filter(isLiveTrial), [activeTrials]);
  const activeTrial = liveTrials[0] ?? null;

  // Load once per session, and again whenever the account changes.
  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    refreshTrials();
  }, [refreshTrials]);

  // Fetch personalised coupons once per login session. The Coupons screen
  // additionally refreshes on focus so WELCOME150 disappears after payment.
  useEffect(() => {
    if (token) refreshCoupons();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /**
   * Keeps a live request fresh. Only runs while there is one — an idle customer
   * costs no requests — and skips ticks while backgrounded, where the poll would
   * only drain battery to update a screen nobody is looking at.
   */
  const hasLiveRequest = liveRequests.length > 0;
  const hasLiveTrial = liveTrials.length > 0;
  useEffect(() => {
    if (!token || (!hasLiveRequest && !hasLiveTrial)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      timer = setTimeout(async () => {
        if (stopped) return;
        if (AppState.currentState === 'active') {
          // Both lists on one timer: a customer can have a normal booking and a
          // trial in flight at the same time, and two independent 6s pollers would
          // double the traffic to keep one tab badge honest.
          await Promise.all([
            hasLiveRequest ? refreshRequests() : Promise.resolve(),
            hasLiveTrial ? refreshTrials() : Promise.resolve(),
          ]);
        }
        if (!stopped) schedule();
      }, LIVE_POLL_MS);
    }
    schedule();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, hasLiveRequest, hasLiveTrial, refreshRequests, refreshTrials]);

  // ── Backend ────────────────────────────────────────────────────────────────

  const saveApiUrl = useCallback(async (url: string) => {
    const clean = url.replace(/\/$/, '');
    setApiUrlState(clean);
    setApiUrl(clean);
    await AsyncStorage.setItem(STORAGE_API_URL, clean);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeOverride_((prev) => {
      // If no override yet, flip from current resolved state
      const next = (prev ?? (systemScheme === 'dark' ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_THEME, next);
      return next;
    });
  }, [systemScheme]);

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      token,
      user,
      isRestoringSession,
      isLoadingUser: isRestoringSession,
      isBlocked,
      signIn,
      setFullName,
      signOut,
      serverSignOut,
      addresses,
      activeAddress,
      addAddress,
      selectAddress,
      removeAddress,
      cart,
      cartLines,
      itemCount,
      subtotal,
      totalMinutes,
      addToCart,
      addBundleToCart,
      incrementItem,
      decrementItem,
      removeFromCart,
      clearCart,
      quantityForService,
      mode,
      setMode,
      scheduledSlot,
      setScheduledSlot,
      couponCode,
      applyCoupon,
      appliedCoupon,
      discount,
      total,
      // Credits come from the server profile — same ledger as /api/user/wallet.
      credits: profile?.credits ?? 0,
      history,
      addToHistory,
      updateHistoryStatus,
      serverCoupons,
      isLoadingCoupons,
      refreshCoupons,
      serviceRequests,
      liveRequests,
      pastRequests,
      activeRequest,
      isLoadingRequests,
      refreshRequests,
      mergeRequest,
      activeTrials,
      trialHistory,
      liveTrials,
      activeTrial,
      isLoadingTrials,
      refreshTrials,
      mergeTrial,
      isDark,
      toggleTheme,
      apiUrl,
      saveApiUrl,
    }),
    [
      profile,
      token,
      user,
      isRestoringSession,
      isBlocked,
      signIn,
      setFullName,
      signOut,
      serverSignOut,
      addresses,
      activeAddress,
      addAddress,
      selectAddress,
      removeAddress,
      cart,
      cartLines,
      itemCount,
      subtotal,
      totalMinutes,
      addToCart,
      addBundleToCart,
      incrementItem,
      decrementItem,
      removeFromCart,
      clearCart,
      quantityForService,
      mode,
      scheduledSlot,
      couponCode,
      applyCoupon,
      appliedCoupon,
      discount,
      total,
      history,
      addToHistory,
      updateHistoryStatus,
      serverCoupons,
      isLoadingCoupons,
      refreshCoupons,
      serviceRequests,
      liveRequests,
      pastRequests,
      activeRequest,
      isLoadingRequests,
      refreshRequests,
      mergeRequest,
      activeTrials,
      trialHistory,
      liveTrials,
      activeTrial,
      isLoadingTrials,
      refreshTrials,
      mergeTrial,
      isDark,
      toggleTheme,
      apiUrl,
      saveApiUrl,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
