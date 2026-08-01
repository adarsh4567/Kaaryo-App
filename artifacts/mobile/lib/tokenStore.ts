/**
 * Persistence for the customer session token.
 *
 * Isolated behind three functions so the storage backend can change without
 * touching callers.
 *
 * ⚠️ This uses AsyncStorage, which is app-sandboxed but **not** encrypted. The
 * integration guide recommends Expo SecureStore / Keychain; that is a native
 * module this project does not yet depend on, and it is unavailable on web, which
 * this app also targets. Swapping it in means editing only this file — branch to
 * `expo-secure-store` on native and keep AsyncStorage for web. Worth doing before
 * production: the token is a 30-day bearer credential with no refresh and no
 * server-side revocation.
 *
 * The key is namespaced `user` and must never be shared with a worker token —
 * mixing the two token families is the one mistake the server can only catch
 * after the fact.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'kaaryo.user.token';

export async function loadToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    // A read failure is indistinguishable from "not signed in" to the caller.
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing useful to do — the in-memory session is cleared regardless.
  }
}
