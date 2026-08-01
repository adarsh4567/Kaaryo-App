import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useColors';
import { getApiUrl } from '@/lib/api';
import { Text } from './ui';

/**
 * Resolves what the server sent into something `Image` can actually load.
 *
 * The contract says `photoUrl` is an absolute URL, and normally it is — but a
 * backend serving static files often hands back a bare path (`/uploads/x.jpg`)
 * instead, and that silently renders nothing rather than erroring in a way
 * anyone notices. Resolving it against the API base costs one branch and
 * removes a whole class of "the field is there but the circle is empty" bug.
 *
 * Returns null for anything unusable so the caller falls back to initials.
 */
function resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  const trimmed = photoUrl.trim();
  if (!trimmed) return null;

  const absolute = ABSOLUTE_URL.exec(trimmed);
  if (!absolute) return `${getApiUrl()}/${trimmed.replace(/^\//, '')}`;

  const [, host, path] = absolute;
  if (LOOPBACK_HOST.test(host)) {
    if (__DEV__) warnOnLoopbackHost(host);
    return `${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  if (__DEV__) warnOnHostMismatch(trimmed);
  return trimmed;
}

/** Captures host (group 1) and everything after it — path, query, hash (group 2). */
const ABSOLUTE_URL = /^https?:\/\/([^/?#]+)(.*)$/i;

/**
 * Hosts that only ever mean "this device". A server that puts one of these in a
 * URL it hands to a phone is describing itself from its own point of view.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i;

const hostOf = (url: string) => url.replace(/^https?:\/\//i, '').split('/')[0];
const mismatchesWarned = new Set<string>();
const loopbackWarned = new Set<string>();

/**
 * Repoints a loopback photo URL at the host the app actually talks to.
 *
 * The backend builds these from its own base-URL config, and when that is left
 * at `localhost` the URL is well-formed and points at a file that genuinely
 * exists — just on an address that, from the phone, is the phone. The bytes are
 * served fine from the API host under the same path, so swapping the host in is
 * enough to render the photo.
 *
 * Narrow on purpose: only loopback is rewritten, never an arbitrary mismatched
 * host. A real CDN on another domain must keep working untouched, and silently
 * rewriting those would turn a visible misconfiguration into a mystery.
 */
function warnOnLoopbackHost(host: string) {
  if (loopbackWarned.has(host)) return;
  loopbackWarned.add(host);
  console.warn(
    `[WorkerAvatar] photoUrl points at ${host}, which on a device means the ` +
      `device itself — rewriting to ${hostOf(getApiUrl())}. The real fix is ` +
      "backend-side: set its public base URL to the address clients use, not localhost."
  );
}

/**
 * Dev-only nudge for the failure that looks exactly like "the backend forgot the
 * field": an absolute `photoUrl` built from a base URL the backend hardcoded for
 * some other deployment. The field is present and well-formed, so nothing on
 * this side looks wrong — the host is just somewhere the phone cannot reach.
 *
 * Deliberately not auto-rewritten to the API host: that would paper over a
 * backend misconfiguration and would break the moment photos legitimately move
 * to a CDN on a different domain.
 */
function warnOnHostMismatch(url: string) {
  const photoHost = hostOf(url);
  const apiHost = hostOf(getApiUrl());
  if (photoHost === apiHost || mismatchesWarned.has(photoHost)) return;
  mismatchesWarned.add(photoHost);
  console.warn(
    `[WorkerAvatar] photoUrl host (${photoHost}) is not the API host (${apiHost}). ` +
      'If the photo never loads, the backend is likely building this URL from a ' +
      'stale base URL — check its public-base-URL config.'
  );
}

/** First letter of the name, or a neutral dash for a worker with no usable name. */
function initialFor(name: string): string {
  const first = name.trim()[0];
  return first ? first.toUpperCase() : '—';
}

/**
 * The assigned professional's headshot, with the initials circle as fallback.
 *
 * Falling back on *load failure* — not just on a null URL — is the point. The
 * photo host is a plain static-file server on the same box as the API, so a
 * wrong host, a file that was never uploaded, or blocked cleartext all end the
 * same way: a request that fails after `photoUrl` already looked valid. Without
 * `onError` that leaves an empty coloured circle for good, which reads as a
 * broken screen rather than a worker who simply has no photo on file.
 */
export function WorkerAvatar({
  photoUrl,
  name,
  size = 64,
  style,
}: {
  photoUrl: string | null | undefined;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const uri = resolvePhotoUrl(photoUrl);
  const [failed, setFailed] = useState(false);

  // A new URL deserves a fresh attempt — otherwise one failure keeps the
  // initials pinned even after the worker (or their photo) changes.
  useEffect(() => setFailed(false), [uri]);

  // The wrapper owns the circle so the same shape covers both states, and so
  // `style` stays a plain ViewStyle instead of straddling ViewStyle/ImageStyle.
  const shape = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.secondary,
  };

  return (
    <View style={[styles.center, shape, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.fill}
          onError={({ nativeEvent }) => {
            if (__DEV__) {
              console.warn(
                `[WorkerAvatar] could not load ${uri} — falling back to initials.`,
                nativeEvent?.error ?? ''
              );
            }
            setFailed(true);
          }}
        />
      ) : (
        <Text variant="h1" style={{ color: colors.secondaryForeground }}>
          {initialFor(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // `overflow: hidden` is what actually clips the square photo into the circle.
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
