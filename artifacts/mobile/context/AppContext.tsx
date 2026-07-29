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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserInfo {
  name: string;
  phone: string;
}

export interface HistoryEntry {
  id: string;
  category: string;
  categoryName: string;
  createdAt: string;
  status: string;
}

interface AppContextValue {
  user: UserInfo | null;
  isLoadingUser: boolean;
  setUser: (user: UserInfo) => Promise<void>;
  history: HistoryEntry[];
  addToHistory: (entry: HistoryEntry) => Promise<void>;
  updateHistoryStatus: (id: string, status: string) => Promise<void>;
  apiUrl: string;
  saveApiUrl: (url: string) => Promise<void>;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_USER = '@kaaryo/user';
const STORAGE_HISTORY = '@kaaryo/history';
const STORAGE_API_URL = '@kaaryo/apiUrl';
const DEFAULT_API_URL = 'http://localhost:4000';

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserInfo | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);

  // Hydrate on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [rawUser, rawHistory, rawApiUrl] = await Promise.all([
          AsyncStorage.getItem(STORAGE_USER),
          AsyncStorage.getItem(STORAGE_HISTORY),
          AsyncStorage.getItem(STORAGE_API_URL),
        ]);
        if (rawUser) setUserState(JSON.parse(rawUser));
        if (rawHistory) setHistory(JSON.parse(rawHistory));
        const url = rawApiUrl ?? DEFAULT_API_URL;
        setApiUrlState(url);
        setApiUrl(url);
      } catch {
        // silently continue if storage fails
      } finally {
        setIsLoadingUser(false);
      }
    }
    hydrate();
  }, []);

  const setUser = useCallback(async (u: UserInfo) => {
    setUserState(u);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(u));
  }, []);

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

  const saveApiUrl = useCallback(async (url: string) => {
    const clean = url.replace(/\/$/, '');
    setApiUrlState(clean);
    setApiUrl(clean);
    await AsyncStorage.setItem(STORAGE_API_URL, clean);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoadingUser,
      setUser,
      history,
      addToHistory,
      updateHistoryStatus,
      apiUrl,
      saveApiUrl,
    }),
    [user, isLoadingUser, setUser, history, addToHistory, updateHistoryStatus, apiUrl, saveApiUrl]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
