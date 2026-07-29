import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { setApiUrl } from '@/lib/api';
import {
  BUNDLES,
  COUPONS,
  getServiceByKey,
  type Coupon,
  type DurationOption,
  type Service,
} from '@/lib/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  user: UserInfo | null;
  isLoadingUser: boolean;
  setUser: (user: UserInfo) => Promise<void>;
  signOut: () => Promise<void>;

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

  // Wallet
  credits: number;

  // Bookings
  history: HistoryEntry[];
  addToHistory: (entry: HistoryEntry) => Promise<void>;
  updateHistoryStatus: (id: string, status: string) => Promise<void>;

  // Backend
  apiUrl: string;
  saveApiUrl: (url: string) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Storage keys are namespaced `v2` because the cart, address book and booking
 * shapes changed — `v1` payloads would hydrate into unrenderable state.
 */
const STORAGE_USER = '@kaaryo/v2/user';
const STORAGE_HISTORY = '@kaaryo/v2/history';
const STORAGE_CART = '@kaaryo/v2/cart';
const STORAGE_ADDRESSES = '@kaaryo/v2/addresses';
const STORAGE_ACTIVE_ADDRESS = '@kaaryo/v2/activeAddress';
const STORAGE_API_URL = '@kaaryo/v2/apiUrl';

const DEFAULT_API_URL = 'http://localhost:4000';

/** Flat convenience fee, shown as its own line so the total never surprises. */
export const PLATFORM_FEE = 19;

/** Sign-up reward, spendable against any booking. */
export const SIGNUP_CREDITS = 150;

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserInfo | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [mode, setMode] = useState<BookingMode>('instant');
  const [scheduledSlot, setScheduledSlot] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);

  // ── Hydration ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function hydrate() {
      try {
        const [rawUser, rawHistory, rawCart, rawAddresses, rawActive, rawApiUrl] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_USER),
            AsyncStorage.getItem(STORAGE_HISTORY),
            AsyncStorage.getItem(STORAGE_CART),
            AsyncStorage.getItem(STORAGE_ADDRESSES),
            AsyncStorage.getItem(STORAGE_ACTIVE_ADDRESS),
            AsyncStorage.getItem(STORAGE_API_URL),
          ]);
        if (rawUser) setUserState(JSON.parse(rawUser));
        if (rawHistory) setHistory(JSON.parse(rawHistory));
        if (rawCart) setCart(JSON.parse(rawCart));
        if (rawAddresses) setAddresses(JSON.parse(rawAddresses));
        if (rawActive) setActiveAddressId(rawActive);
        const url = rawApiUrl ?? DEFAULT_API_URL;
        setApiUrlState(url);
        setApiUrl(url);
      } catch {
        // A corrupt cache should not block the app — start from defaults.
      } finally {
        setIsLoadingUser(false);
      }
    }
    hydrate();
  }, []);

  // ── Identity ───────────────────────────────────────────────────────────────

  const setUser = useCallback(async (next: UserInfo) => {
    setUserState(next);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(next));
  }, []);

  const signOut = useCallback(async () => {
    setUserState(null);
    setCart([]);
    setHistory([]);
    setAddresses([]);
    setActiveAddressId(null);
    setCouponCode(null);
    await AsyncStorage.multiRemove([
      STORAGE_USER,
      STORAGE_HISTORY,
      STORAGE_CART,
      STORAGE_ADDRESSES,
      STORAGE_ACTIVE_ADDRESS,
    ]);
  }, []);

  // ── Address book ───────────────────────────────────────────────────────────

  const persistAddresses = useCallback(async (next: Address[]) => {
    setAddresses(next);
    await AsyncStorage.setItem(STORAGE_ADDRESSES, JSON.stringify(next));
  }, []);

  const addAddress = useCallback(
    async (input: Omit<Address, 'id'>) => {
      const created: Address = { ...input, id: `addr_${Date.now()}` };
      const next = [created, ...addresses];
      await persistAddresses(next);
      setActiveAddressId(created.id);
      await AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, created.id);
      return created;
    },
    [addresses, persistAddresses]
  );

  const selectAddress = useCallback(async (id: string) => {
    setActiveAddressId(id);
    await AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, id);
  }, []);

  const removeAddress = useCallback(
    async (id: string) => {
      const next = addresses.filter((a) => a.id !== id);
      await persistAddresses(next);
      if (activeAddressId === id) {
        const fallback = next[0]?.id ?? null;
        setActiveAddressId(fallback);
        if (fallback) await AsyncStorage.setItem(STORAGE_ACTIVE_ADDRESS, fallback);
        else await AsyncStorage.removeItem(STORAGE_ACTIVE_ADDRESS);
      }
    },
    [addresses, activeAddressId, persistAddresses]
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
    const coupon = COUPONS.find((c) => c.code === couponCode);
    // A coupon stays selected but stops applying if the cart drops below its floor.
    if (!coupon || subtotal < coupon.minSubtotal) return null;
    return coupon;
  }, [couponCode, subtotal]);

  const discount = appliedCoupon?.discount ?? 0;
  const total = useMemo(
    () => (subtotal === 0 ? 0 : Math.max(0, subtotal - discount) + PLATFORM_FEE),
    [subtotal, discount]
  );

  const applyCoupon = useCallback((code: string | null) => setCouponCode(code), []);

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

  // ── Backend ────────────────────────────────────────────────────────────────

  const saveApiUrl = useCallback(async (url: string) => {
    const clean = url.replace(/\/$/, '');
    setApiUrlState(clean);
    setApiUrl(clean);
    await AsyncStorage.setItem(STORAGE_API_URL, clean);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isLoadingUser,
      setUser,
      signOut,
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
      credits: SIGNUP_CREDITS,
      history,
      addToHistory,
      updateHistoryStatus,
      apiUrl,
      saveApiUrl,
    }),
    [
      user,
      isLoadingUser,
      setUser,
      signOut,
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
