import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { MapBackdrop } from '@/components/MapBackdrop';
import {
  Badge,
  BottomBar,
  Button,
  Card,
  Divider,
  EmptyState,
  IconBubble,
  Rating,
  Text,
} from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import {
  cancelUserRequest,
  createUserRequest,
  getUserRequest,
  isRequestApiError,
  retryUserRequest,
  secondsLeft,
  trackUserRequest,
  type UserRequest,
} from '@/lib/userRequests';
import { formatPrice, getServiceByKey } from '@/lib/catalog';

/** Beat spent on the result before the bookings tab takes over. */
const HANDOFF_MS = 1400;

/**
 * The instant dispatch screen.
 *
 * Places the request, then sweeps the map for the server's 60-second search
 * window. Unlike a scripted wait, this one has a real deadline: the server
 * answers with an acceptance or an expiry inside that window, so the countdown is
 * rendered from its absolute `searchExpiresAt` rather than a local timer — a
 * phone that was backgrounded, or whose clock is skewed, still shows the truth.
 *
 * On acceptance the screen hands off to Bookings, which owns tracking and
 * payment. On expiry it offers the server's retry, which keeps the same request
 * id and sweeps nearby supply again.
 */
export default function DispatchScreen() {
  const params = useLocalSearchParams<{
    serviceKey?: string;
    category?: string;
    subcategory?: string;
    jobDescription?: string;
  }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token, activeAddress, mergeRequest } = useAppContext();

  const service = getServiceByKey(params.serviceKey);

  const [request, setRequest] = useState<UserRequest | null>(null);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState<'cancel' | 'retry' | null>(null);
  const [retryCapped, setRetryCapped] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [handingOff, setHandingOff] = useState(false);

  const requestId = request?.id;
  const attempt = request?.attempt;
  const status = request?.status;

  /** One-shot guards for the hand-off, which outlives its own effect run. */
  const handedOffRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    []
  );

  /**
   * Places the booking, once, on mount. Everything it closes over is fixed for
   * the life of this screen — the route params cannot change, and a profile or
   * address edit mid-dispatch must not retarget a request already in flight.
   */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setError('You are signed out. Please sign in again.');
        return;
      }
      if (!service || !params.category) {
        setError('This service is not available for instant booking.');
        return;
      }
      if (
        !activeAddress ||
        typeof activeAddress.lat !== 'number' ||
        typeof activeAddress.lng !== 'number'
      ) {
        setError('This address has no location pinned. Please re-add it from the address screen.');
        return;
      }

      try {
        const result = await createUserRequest(token, {
          category: params.category,
          subcategory: params.subcategory || undefined,
          jobDescription: params.jobDescription || service.name,
          lat: activeAddress.lat,
          lng: activeAddress.lng,
          address: [activeAddress.line, activeAddress.locality, activeAddress.city]
            .filter(Boolean)
            .join(', '),
        });
        if (cancelled) return;
        setRequest(result.request);
        setExisting(result.existing);
        mergeRequest(result.request);
      } catch (err) {
        if (cancelled) return;
        // An incomplete profile is a missing name, and the name screen is the
        // fix — routing there beats an error the user cannot act on.
        if (isRequestApiError(err) && err.code === 'PROFILE_INCOMPLETE') {
          router.replace('/name');
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : 'Could not reach dispatch. Check the API URL in Account.'
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Polls the request until it settles.
   *
   * Keyed on `attempt` as well as the id: a retry keeps the same id but restarts
   * the search, and the poller stops itself once a status stops changing on its
   * own — without the attempt in the key it would never wake back up.
   */
  useEffect(() => {
    if (!token || !requestId) return;
    return trackUserRequest(token, requestId, (next) => {
      setRequest(next);
      mergeRequest(next);
    });
  }, [token, requestId, attempt, mergeRequest]);

  /** Ticks the visible countdown between polls. */
  useEffect(() => {
    if (!request) return;
    setCountdown(secondsLeft(request));
    if (request.status !== 'searching') return;
    const timer = setInterval(() => setCountdown(secondsLeft(request)), 500);
    return () => clearInterval(timer);
  }, [request]);

  /**
   * A professional accepted (or the job has already moved past that). The booking
   * is real from here on, so Bookings takes over tracking and payment.
   *
   * Fires once, guarded by a ref, and deliberately depends on nothing that the
   * poller churns. The timer is not torn down on re-render either: the poll hands
   * back a fresh `request` object every couple of seconds, and a cleanup keyed on
   * it would cancel this timeout before it ever fired, stranding the screen on
   * "taking you to your booking".
   */
  useEffect(() => {
    if (handedOffRef.current || !requestId) return;
    if (status !== 'in_progress' && status !== 'pending_rating' && status !== 'completed') return;

    handedOffRef.current = true;
    setHandingOff(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      // The screen may be gone by now — the user can still hit Cancel during the
      // beat, and navigating out from under them would be worse than doing nothing.
      if (!aliveRef.current) return;
      router.replace({
        pathname: '/(tabs)/bookings',
        params: { filter: 'live', highlight: requestId },
      });
    }, HANDOFF_MS);
  }, [status, requestId]);

  async function handleCancel() {
    if (!token || !request) return;
    Alert.alert('Stop the search?', 'We will call off this booking.', [
      { text: 'Keep looking', style: 'cancel' },
      {
        text: 'Stop search',
        style: 'destructive',
        onPress: async () => {
          setBusy('cancel');
          try {
            const updated = await cancelUserRequest(token, request.id);
            mergeRequest(updated);
          } catch {
            // The bookings list re-reads from the server, so it will catch up.
          }
          router.replace('/(tabs)');
        },
      },
    ]);
  }

  async function handleRetry() {
    if (!token || !request) return;
    setBusy('retry');
    try {
      const result = await retryUserRequest(token, request.id);
      setRequest(result.request);
      mergeRequest(result.request);
    } catch (err) {
      if (isRequestApiError(err) && err.code === 'RETRY_LIMIT_REACHED') {
        // Out of attempts on this request. A fresh booking is always allowed.
        setRetryCapped(true);
      } else if (isRequestApiError(err) && err.status === 409) {
        // Already searching again, or moved on — trust the server and re-read.
        const fresh = await getUserRequest(token, request.id).catch(() => null);
        if (fresh) {
          setRequest(fresh);
          mergeRequest(fresh);
        }
      } else {
        Alert.alert(
          'Could not search again',
          err instanceof Error ? err.message : 'Please try again.'
        );
      }
    } finally {
      setBusy(null);
    }
  }

  // ── Could not even start ───────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title="Could not start the search" message={error}>
          <Button label="Back to home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  const addressLine = activeAddress
    ? [activeAddress.line, activeAddress.locality].filter(Boolean).join(', ')
    : 'Your address';

  const searching = !request || request.status === 'searching';
  const expired = request?.status === 'expired';
  const worker = request?.worker ?? null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + (searching || expired ? 120 : 40) }}
      >
        <MapBackdrop
          height={insets.top + 240}
          radar={searching}
          pulsing={!searching && !expired}
          showExperts={!expired}
          caption={request?.address || addressLine}
        />

        <View style={styles.body}>
          {/* ── Status ───────────────────────────────────────────────────── */}
          <Card padding="lg" style={styles.headCard}>
            {existing ? (
              <View style={[styles.inlineNotice, { backgroundColor: colors.warningLight }]}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color={colors.warning}
                />
                <Text variant="caption" tone="warning" style={styles.flex}>
                  You already had a booking in progress, so we brought you to that one.
                </Text>
              </View>
            ) : null}

            <View style={styles.headRow}>
              <View
                style={[
                  styles.liveDot,
                  {
                    backgroundColor: expired
                      ? colors.mutedForeground
                      : searching
                        ? colors.warning
                        : colors.success,
                  },
                ]}
              />
              <Text variant="h2" style={styles.flex}>
                {!request
                  ? 'Placing your booking'
                  : expired
                    ? 'No one free right now'
                    : searching
                      ? 'Finding the nearest worker'
                      : worker
                        ? 'Professional assigned'
                        : 'Booking confirmed'}
              </Text>
              {searching && request ? (
                <View style={[styles.countdown, { backgroundColor: colors.secondary }]}>
                  <Text variant="h3" style={{ color: colors.secondaryForeground }}>
                    {countdown}s
                  </Text>
                </View>
              ) : null}
            </View>

            <Text variant="body" tone="muted" style={styles.headSub}>
              {!request
                ? 'Sending your job to professionals near you…'
                : expired
                  ? request.canRetry && !retryCapped
                    ? 'Nobody accepted in time. Searching again reaches the professionals who missed it.'
                    : 'No professionals are available right now. Try again in a little while.'
                  : searching
                    ? `Looking for a professional near ${addressLine}. This takes up to a minute.`
                    : worker
                      ? `${worker.name.split(' ')[0]} is on the way. Opening your booking…`
                      : 'Opening your booking…'}
            </Text>

            {/* ── Search telemetry ───────────────────────────────────────── */}
            {request && (searching || expired) ? (
              <>
                <Divider spacingY={spacing.lg} />
                <View style={styles.statRow}>
                  <Stat
                    icon="account-multiple-outline"
                    value={String(request.workersNotified ?? 0)}
                    label="notified"
                  />
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <Stat
                    icon="map-marker-radius-outline"
                    value={`${request.radiusKm ?? 3} km`}
                    label="radius"
                  />
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <Stat
                    icon="refresh"
                    value={`${request.attempt}/${request.maxAttempts}`}
                    label="attempt"
                  />
                </View>
              </>
            ) : null}

            {/* ── Assigned professional ──────────────────────────────────── */}
            {worker ? (
              <>
                <Divider spacingY={spacing.lg} />
                <View style={styles.workerRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                    <Text variant="h2" style={{ color: colors.secondaryForeground }}>
                      {worker.name[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="h3" numberOfLines={1}>
                      {worker.name}
                    </Text>
                    <View style={styles.workerMeta}>
                      {/* A professional with no ratings yet reads "New", not 0. */}
                      {worker.rating != null ? (
                        <>
                          <Rating value={worker.rating} size={12} />
                          <Text variant="caption" tone="muted">
                            {worker.rating.toFixed(1)} · {worker.jobsCompleted} jobs
                          </Text>
                        </>
                      ) : (
                        <Text variant="caption" tone="muted">
                          New · {worker.jobsCompleted} jobs
                        </Text>
                      )}
                    </View>
                  </View>
                  <Badge
                    label={`${worker.distanceKm} km`}
                    tone="primary"
                    icon="navigation-variant-outline"
                  />
                </View>
              </>
            ) : null}
          </Card>

          {/* ── What was asked for ─────────────────────────────────────────── */}
          {request ? (
            <Card padding="lg" style={styles.jobCard}>
              <Text variant="captionSemi" tone="muted" style={styles.jobLabel}>
                YOUR REQUEST
              </Text>
              <View style={styles.jobHead}>
                <IconBubble icon={service?.icon ?? 'clipboard-text-outline'} size={42} />
                <View style={styles.flex}>
                  <Text variant="bodySemi" numberOfLines={1}>
                    {request.subcategoryName
                      ? `${request.categoryName} · ${request.subcategoryName}`
                      : request.categoryName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatPrice(request.totalPrice)} · pay after the job
                  </Text>
                </View>
              </View>

              {request.jobDescription ? (
                <>
                  <Divider spacingY={spacing.md} />
                  <View style={styles.noteRow}>
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={16}
                      color={colors.mutedForeground}
                    />
                    <Text variant="body" style={styles.flex}>
                      {request.jobDescription}
                    </Text>
                  </View>
                </>
              ) : null}
            </Card>
          ) : null}

          {!searching && !expired && request ? (
            <View style={styles.handoff}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="caption" tone="muted">
                Taking you to your live booking
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      {expired && request ? (
        <BottomBar bottomInset={insets.bottom}>
          {request.canRetry && !retryCapped ? (
            <View style={styles.actionRow}>
              {/* Not "Cancel" and not "Book again": the search already ended by
                  itself, so there is nothing to cancel, and this places no
                  booking. It only walks away — same words as the capped branch
                  below, because it is the same action. */}
              <Button
                label="Back to home"
                variant="secondary"
                onPress={() => router.replace('/(tabs)')}
              />
              <Button
                label={busy === 'retry' ? 'Searching…' : 'Search again'}
                icon="refresh"
                loading={busy === 'retry'}
                disabled={busy !== null}
                style={styles.flex}
                onPress={handleRetry}
              />
            </View>
          ) : (
            <Button
              label="Back to home"
              iconRight="arrow-right"
              fullWidth
              onPress={() => router.replace('/(tabs)')}
            />
          )}
        </BottomBar>
      ) : searching ? (
        <BottomBar bottomInset={insets.bottom}>
          <Button
            label={busy === 'cancel' ? 'Stopping…' : 'Cancel search'}
            variant="destructive"
            icon="close"
            fullWidth
            haptic={false}
            loading={busy === 'cancel'}
            disabled={!request || busy !== null}
            onPress={handleCancel}
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({
  icon,
  value,
  label,
}: {
  icon: 'account-multiple-outline' | 'map-marker-radius-outline' | 'refresh';
  value: string;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={15} color={colors.mutedForeground} />
      <Text variant="h3">{value}</Text>
      <Text variant="micro" tone="muted" center>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg },
  // Overlaps the map so the card reads as a sheet drawn over it.
  headCard: { marginTop: -spacing.xl },
  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  countdown: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  headSub: { marginTop: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  jobCard: { marginTop: spacing.md },
  jobLabel: { letterSpacing: 0.8, marginBottom: spacing.md },
  jobHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  handoff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
});
