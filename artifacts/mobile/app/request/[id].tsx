import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { MapBackdrop } from '@/components/MapBackdrop';
import { LiveTrackingMap } from '@/components/map/LiveTrackingMap';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import {
  Badge,
  BottomBar,
  BottomSheet,
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
  getUserRequest,
  payForRequest,
  retryUserRequest,
  secondsLeft,
  trackUserRequest,
  type AssignedWorker,
  type PaymentMethod,
  type RequestStage,
  type UserRequest,
} from '@/lib/userRequests';
import { formatPrice, type MdiName } from '@/lib/catalog';

/** Payment rails the server accepts, in the order Indian customers reach for them. */
const METHODS: { key: PaymentMethod; label: string; detail: string; icon: MdiName }[] = [
  { key: 'upi', label: 'UPI', detail: 'GPay, PhonePe, Paytm', icon: 'cellphone-check' },
  { key: 'cash', label: 'Cash', detail: 'Hand it to your professional', icon: 'cash' },
  { key: 'card', label: 'Card', detail: 'Debit or credit', icon: 'credit-card-outline' },
  { key: 'netbanking', label: 'Net banking', detail: 'All major banks', icon: 'bank-outline' },
  { key: 'wallet', label: 'Wallet', detail: 'Prepaid balance', icon: 'wallet-outline' },
];

/**
 * The header subtitle, keyed off `stage` — the server-composed field that's
 * authoritative for what to render, not off `status`. `completed` still splits
 * on `paid` for a nicer final line; every other row matches the backend's copy
 * table exactly.
 */
function subtitleForStage(stage: RequestStage, worker: AssignedWorker | undefined, paid: boolean): string {
  switch (stage) {
    case 'searching':
      return 'Finding a professional';
    case 'en_route':
      return 'Professional on the way';
    case 'arriving_soon':
      return worker?.etaMinutes != null ? `Arriving in ~${worker.etaMinutes} min` : 'Arriving soon';
    case 'arrived':
      return 'Your professional has arrived';
    case 'working':
      return 'Work in progress';
    case 'work_done':
      return 'Work complete — payment due';
    case 'completed':
      return paid ? 'Paid' : 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Nobody accepted';
    default:
      return 'Professional on the way';
  }
}

/** Where a request is in its life, for the timeline. */
const STEPS: { label: string; reached: (r: UserRequest) => boolean }[] = [
  { label: 'Booking confirmed', reached: () => true },
  { label: 'Professional assigned', reached: (r) => !!r.acceptedAt || !!r.worker },
  { label: 'Work finished', reached: (r) => !!r.workDoneAt || r.payment.payable || r.payment.status === 'paid' },
  { label: 'Paid', reached: (r) => r.payment.status === 'paid' },
];

/**
 * Tracking and payment for an instant booking.
 *
 * Two independent tracks run on one request and this screen renders both: the job
 * status, which only the professional advances, and the payment status, which only
 * the customer advances. Payment falls due when the work is physically done, not
 * when the job closes — closing additionally needs the professional's own rating,
 * and the customer's ability to pay must not wait on a tap they cannot make.
 */
export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token, mergeRequest, refreshRequests } = useAppContext();

  const [request, setRequest] = useState<UserRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [busy, setBusy] = useState<'cancel' | 'retry' | 'pay' | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const attempt = request?.attempt;
  /** Tracked outside state so the arrival haptic fires once per transition, not per render. */
  const prevStageRef = useRef<RequestStage | undefined>(undefined);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;

    getUserRequest(token, id)
      .then((fresh) => {
        if (cancelled) return;
        prevStageRef.current = fresh.stage;
        setRequest(fresh);
        mergeRequest(fresh);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 404 is also what a request owned by somebody else returns, on purpose,
        // so ids cannot be enumerated. Either way it is gone.
        setFetchError(err instanceof Error ? err.message : 'This booking is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, id, mergeRequest]);

  // Keyed on `attempt` too, so a retry restarts a poller that had stopped itself.
  useEffect(() => {
    if (!token || !id || loading) return;
    return trackUserRequest(token, id, (next) => {
      if (next.stage === 'arrived' && prevStageRef.current !== 'arrived') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      prevStageRef.current = next.stage;
      setRequest(next);
      mergeRequest(next);
    });
  }, [token, id, attempt, loading, mergeRequest]);

  useEffect(() => {
    if (!request) return;
    setCountdown(secondsLeft(request));
    if (request.status !== 'searching') return;
    const timer = setInterval(() => setCountdown(secondsLeft(request)), 500);
    return () => clearInterval(timer);
  }, [request]);

  async function handleCancel() {
    if (!token || !request) return;
    const assigned = request.worker?.name;
    Alert.alert(
      'Cancel this booking?',
      assigned
        ? `${assigned} is already on the way. Cancelling now may affect your account standing.`
        : 'We will stop looking for a professional.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setBusy('cancel');
            try {
              const updated = await cancelUserRequest(token, request.id);
              setRequest(updated);
              mergeRequest(updated);
            } catch (err) {
              Alert.alert(
                'Could not cancel',
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  async function handleRetry() {
    if (!token || !request) return;
    setBusy('retry');
    try {
      const result = await retryUserRequest(token, request.id);
      setRequest(result.request);
      mergeRequest(result.request);
    } catch (err) {
      Alert.alert(
        'Could not search again',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * Initiate then confirm, as one tap. A decline leaves the job payable, so the
   * sheet stays open with the bank's reason and the customer can pick another rail.
   */
  async function handlePay(method: PaymentMethod) {
    if (!token || !request) return;
    setBusy('pay');
    setPayError('');
    try {
      const result = await payForRequest(token, request.id, method);
      setRequest(result.request);
      mergeRequest(result.request);
      if (result.request.payment.status === 'paid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPayOpen(false);
        refreshRequests();
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
      // The 402 body carries the updated request, so re-read to pick up the
      // failure reason and the fact that it is still payable.
      const fresh = await getUserRequest(token, request.id).catch(() => null);
      if (fresh) {
        setRequest(fresh);
        mergeRequest(fresh);
      }
    } finally {
      setBusy(null);
    }
  }

  // ── Loading / gone ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="body" tone="muted" style={styles.loadingText}>
          Loading your booking…
        </Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title="Booking" topInset={insets.top} />
        <EmptyState
          icon="cloud-off-outline"
          title="Could not load this booking"
          message={fetchError || 'This booking is no longer available.'}
        >
          <Button label="Go home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  const worker = request.worker;
  const paid = request.payment.status === 'paid';
  const stage = request.stage;
  const searching = stage === 'searching';
  const expired = stage === 'expired';
  const cancelled = stage === 'cancelled';
  // The map only means something while a professional is actually travelling —
  // from 'working' onward the screen is about the job and the payment, not location.
  const showLiveMap = stage === 'en_route' || stage === 'arriving_soon' || stage === 'arrived';
  const title = request.subcategoryName
    ? `${request.categoryName} · ${request.subcategoryName}`
    : request.categoryName;

  // ── Cancelled / expired ────────────────────────────────────────────────────
  if (cancelled || (expired && !request.canRetry)) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title={title} subtitle={cancelled ? 'Cancelled' : 'No match'} topInset={insets.top} />
        <EmptyState
          icon={cancelled ? 'close-circle-outline' : 'timer-sand-empty'}
          title={cancelled ? 'Booking cancelled' : 'No professionals available'}
          message={
            cancelled
              ? 'This booking was cancelled. Nothing has been charged.'
              : 'Nobody could take this up. Try again in a little while, or book a scheduled visit.'
          }
        >
          <Button label="Book again" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <TrackHeader
        title={title}
        subtitle={subtitleForStage(stage, worker, paid)}
        topInset={insets.top}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
      >
        {searching ? (
          <MapBackdrop
            height={220}
            radar
            showExperts
            caption={request.address || 'Your address'}
          />
        ) : showLiveMap ? (
          <LiveTrackingMap
            height={190}
            destination={request.location?.coordinates}
            worker={worker?.location?.coordinates}
            heading={worker?.heading}
            arrived={stage === 'arrived'}
            locationStale={worker?.locationStale}
            caption={request.address || 'Your address'}
            expandable
            expandedTitle={subtitleForStage(stage, worker, paid)}
          />
        ) : null}

        <View style={styles.body}>
          {/* ── Searching ────────────────────────────────────────────────── */}
          {searching ? (
            <Card padding="lg" style={styles.headCard}>
              <View style={styles.headRow}>
                <View style={[styles.liveDot, { backgroundColor: colors.warning }]} />
                <Text variant="h2" style={styles.flex}>
                  Finding a professional
                </Text>
                <View style={[styles.countdown, { backgroundColor: colors.secondary }]}>
                  <Text variant="h3" style={{ color: colors.secondaryForeground }}>
                    {countdown}s
                  </Text>
                </View>
              </View>
              <Text variant="body" tone="muted" style={styles.headSub}>
                {request.workersNotified ?? 0} professionals notified within{' '}
                {request.radiusKm ?? 3} km · attempt {request.attempt} of {request.maxAttempts}
              </Text>
            </Card>
          ) : null}

          {/* ── Expired, retryable ───────────────────────────────────────── */}
          {expired ? (
            <Card padding="lg" style={styles.headCard}>
              <Text variant="h2">No one free right now</Text>
              <Text variant="body" tone="muted" style={styles.headSub}>
                Nobody accepted within the minute. Searching again reaches the professionals who
                missed it — attempt {request.attempt} of {request.maxAttempts} used.
              </Text>
            </Card>
          ) : null}

          {/* ── The professional ─────────────────────────────────────────── */}
          {worker ? (
            <Card padding="lg" style={styles.headCard}>
              <View style={styles.workerTop}>
                <WorkerAvatar photoUrl={worker.photoUrl} name={worker.name} size={64} />
                <View style={styles.flex}>
                  <Text variant="h3" numberOfLines={1}>
                    {worker.name}
                  </Text>
                  <View style={styles.workerMeta}>
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
                  <Badge
                    label={`${worker.distanceKm} km away`}
                    tone="primary"
                    icon="navigation-variant-outline"
                    style={styles.workerBadge}
                  />
                </View>
              </View>

              <Divider spacingY={spacing.lg} />

              {/* Contact is the phone number revealed on acceptance — there is no
                  in-app chat, so this is the only channel. */}
              <View style={styles.workerActions}>
                <Button
                  label={`Call ${worker.name.split(' ')[0]}`}
                  icon="phone"
                  style={styles.flex}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(`tel:${worker.phone}`);
                  }}
                />
                <Button
                  label="WhatsApp"
                  icon="whatsapp"
                  variant="secondary"
                  onPress={() =>
                    Linking.openURL(`https://wa.me/91${worker.phone.replace(/\D/g, '').slice(-10)}`)
                  }
                />
              </View>
            </Card>
          ) : null}

          {/* ── Progress ─────────────────────────────────────────────────── */}
          {!searching && !expired ? (
            <Card padding="lg" style={styles.card}>
              {STEPS.map((step, i) => {
                const done = step.reached(request);
                return (
                  <View key={step.label} style={styles.stepRow}>
                    <View style={styles.stepGutter}>
                      <View
                        style={[
                          styles.stepDot,
                          {
                            backgroundColor: done ? colors.primary : colors.muted,
                            borderColor: done ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        {done ? (
                          <MaterialCommunityIcons
                            name="check"
                            size={11}
                            color={colors.primaryForeground}
                          />
                        ) : null}
                      </View>
                      {i < STEPS.length - 1 ? (
                        <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                      ) : null}
                    </View>
                    <Text
                      variant={done ? 'bodySemi' : 'body'}
                      tone={done ? 'default' : 'muted'}
                      style={styles.stepLabel}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {/* ── Bill ─────────────────────────────────────────────────────── */}
          <Card tone={paid ? 'tint' : 'card'} padding="lg" style={styles.card}>
            <View style={styles.billRow}>
              <View style={styles.flex}>
                <Text variant="caption" tone="muted">
                  {paid ? 'Paid' : 'Amount to pay'}
                </Text>
                <Text variant="display">{formatPrice(request.payment.amount)}</Text>
              </View>
              {paid ? (
                <IconBubble icon="check-decagram" size={48} tone="primary" />
              ) : null}
            </View>

            {paid && request.payment.transactionId ? (
              <>
                <Divider spacingY={spacing.md} />
                <View style={styles.receiptRow}>
                  <Text variant="caption" tone="muted">
                    {request.payment.method?.toUpperCase()} · {request.payment.transactionId}
                  </Text>
                </View>
              </>
            ) : request.payment.failureReason ? (
              <>
                <Divider spacingY={spacing.md} />
                <View style={styles.noteRow}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.destructive}
                  />
                  <Text variant="caption" tone="destructive" style={styles.flex}>
                    {request.payment.failureReason}
                  </Text>
                </View>
              </>
            ) : null}
          </Card>

          {/* ── Job detail ───────────────────────────────────────────────── */}
          <Card padding="lg" style={styles.card}>
            <Text variant="captionSemi" tone="muted" style={styles.jobLabel}>
              BOOKING DETAILS
            </Text>
            {request.jobDescription ? (
              <Text variant="body">{request.jobDescription}</Text>
            ) : (
              <Text variant="body">{title}</Text>
            )}
            <Divider spacingY={spacing.md} />
            <View style={styles.noteRow}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={17}
                color={colors.mutedForeground}
              />
              <Text variant="body" style={styles.flex}>
                {request.address || 'Location captured'}
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <BottomBar bottomInset={insets.bottom}>
        {request.payment.payable ? (
          <Button
            label={`Pay ${formatPrice(request.payment.amount)}`}
            icon="cash-multiple"
            fullWidth
            onPress={() => {
              setPayError('');
              setPayOpen(true);
            }}
          />
        ) : expired && request.canRetry ? (
          <View style={styles.actionRow}>
            {/* Walks away — it neither cancels the expired request nor books a
                new one, so it is named for where it goes. */}
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
        ) : request.canCancel ? (
          <Button
            label={busy === 'cancel' ? 'Cancelling…' : 'Cancel booking'}
            variant="destructive"
            icon="close"
            fullWidth
            haptic={false}
            loading={busy === 'cancel'}
            disabled={busy !== null}
            onPress={handleCancel}
          />
        ) : (
          <Button
            label="Done"
            iconRight="arrow-right"
            fullWidth
            onPress={() => router.replace('/(tabs)/bookings')}
          />
        )}
      </BottomBar>

      {/* ── Payment sheet ──────────────────────────────────────────────────── */}
      <BottomSheet visible={payOpen} onClose={() => setPayOpen(false)}>
        <View style={styles.sheetHead}>
          <Text variant="h2">Pay {formatPrice(request.payment.amount)}</Text>
          <Text variant="caption" tone="muted">
            Your professional is credited as soon as this goes through.
          </Text>
        </View>

        {payError ? (
          <View style={[styles.sheetNotice, { backgroundColor: colors.destructiveLight }]}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={17}
              color={colors.destructive}
            />
            <Text variant="caption" tone="destructive" style={styles.flex}>
              {payError}
            </Text>
          </View>
        ) : null}

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          {METHODS.map((method, i) => (
            <Pressable
              key={method.key}
              accessibilityRole="button"
              disabled={busy === 'pay'}
              onPress={() => handlePay(method.key)}
              style={({ pressed }) => [
                styles.methodRow,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: i === METHODS.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  opacity: pressed || busy === 'pay' ? 0.6 : 1,
                },
              ]}
            >
              <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
                <MaterialCommunityIcons
                  name={method.icon}
                  size={19}
                  color={colors.secondaryForeground}
                />
              </View>
              <View style={styles.flex}>
                <Text variant="bodySemi">{method.label}</Text>
                <Text variant="caption" tone="muted">
                  {method.detail}
                </Text>
              </View>
              {busy === 'pay' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.mutedForeground}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** This screen is reached by replace as often as by push, so home is the way out. */
function TrackHeader({
  title,
  subtitle,
  topInset,
}: {
  title: string;
  subtitle?: string;
  topInset: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + spacing.sm,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to bookings"
        hitSlop={8}
        onPress={() => router.replace('/(tabs)/bookings')}
        style={({ pressed }) => [
          styles.headerBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={19} color={colors.foreground} />
      </Pressable>
      <View style={styles.flex}>
        <Text variant="h3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { paddingHorizontal: spacing.lg },
  headCard: { marginTop: -spacing.xl },
  card: { marginTop: spacing.md },
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
  workerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  workerBadge: { marginTop: spacing.sm },
  workerActions: { flexDirection: 'row', gap: spacing.sm },
  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepGutter: { alignItems: 'center' },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: 1.5, flex: 1, marginVertical: 3 },
  stepLabel: { paddingBottom: spacing.lg },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobLabel: { letterSpacing: 0.8, marginBottom: spacing.sm },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  sheetHead: { paddingHorizontal: spacing.lg, gap: 2 },
  sheetNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  sheetScroll: { flexShrink: 1, marginTop: spacing.md, paddingHorizontal: spacing.lg },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
