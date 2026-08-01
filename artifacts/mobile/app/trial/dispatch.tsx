import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { invalidateTrialOffer } from '@/hooks/useTrialOffer';
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
  Text,
} from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import {
  cancelTrial,
  createTrial,
  formatTrialClock,
  getTrial,
  isNoTrialWorkers,
  isTrialApiError,
  netCostOf,
  retryTrial,
  trackTrial,
  trialSecondsLeft,
  type Trial,
} from '@/lib/userTrials';
import { formatPrice, getServiceByKey } from '@/lib/catalog';

/** Beat spent on the result before the tracking screen takes over. */
const HANDOFF_MS = 1400;

/**
 * The discounted-trial dispatch screen.
 *
 * Places the trial, then waits out a search that works nothing like the normal
 * one. A trial is a *directed* offer: up to three trainees are asked one at a
 * time, 90 seconds each, because accepting moves a real person's onboarding
 * forward and only one of them can have it. So the wait reaches ~4.5 minutes and
 * it progresses visibly — `candidateNumber of candidateCount` is the thing that
 * makes a four-minute wait legible rather than broken.
 *
 * The countdown is rendered from the server's absolute `searchExpiresAt`, so a
 * backgrounded or clock-skewed phone still shows the truth, and the customer is
 * free to leave: the booking stays live and the tracking screen picks it up.
 */
export default function TrialDispatchScreen() {
  const params = useLocalSearchParams<{
    serviceKey?: string;
    subcategory?: string;
    jobDescription?: string;
  }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token, activeAddress, mergeTrial, refreshTrials } = useAppContext();

  const service = getServiceByKey(params.serviceKey);

  const [trial, setTrial] = useState<Trial | null>(null);
  const [error, setError] = useState('');
  /** No trainee is waiting nearby. A normal outcome, and its own screen. */
  const [noWorkers, setNoWorkers] = useState(false);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState<'cancel' | 'retry' | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [handingOff, setHandingOff] = useState(false);

  const trialId = trial?.id;
  const status = trial?.status;
  const attempt = trial?.searchAttempt;

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
   * Places the trial, once, on mount. Everything it closes over is fixed for the
   * life of this screen — an address edit mid-search must not retarget a booking
   * a trainee is already looking at.
   */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setError('You are signed out. Please sign in again.');
        return;
      }
      if (
        !activeAddress ||
        typeof activeAddress.lat !== 'number' ||
        typeof activeAddress.lng !== 'number'
      ) {
        setError(
          'This address has no location pinned. Please re-add it from the address screen.'
        );
        return;
      }

      try {
        const result = await createTrial(token, {
          // No `category` — the server fixes it to cleaning and 422s on anything
          // sent. No name or phone either: they come off the token.
          subcategory: params.subcategory || undefined,
          jobDescription: params.jobDescription || service?.name || 'Home cleaning',
          lat: activeAddress.lat,
          lng: activeAddress.lng,
          address: [activeAddress.line, activeAddress.locality, activeAddress.city]
            .filter(Boolean)
            .join(', '),
        });
        if (cancelled) return;
        setTrial(result.trial);
        setExisting(result.existing);
        mergeTrial(result.trial);
        // The account now has a trial in flight, so the cached offer is stale.
        invalidateTrialOffer();
      } catch (err) {
        if (cancelled) return;
        if (isNoTrialWorkers(err)) {
          // Nothing was created, so there is no id and nothing to retry.
          setNoWorkers(true);
          return;
        }
        if (isTrialApiError(err) && err.code === 'PROFILE_INCOMPLETE') {
          router.replace('/name');
          return;
        }
        if (isTrialApiError(err) && err.code === 'TRIAL_ALLOWANCE_USED') {
          invalidateTrialOffer();
        }
        setError(
          err instanceof Error
            ? err.message
            : 'Could not start the trial. Check the API URL in Account.'
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
   * Polls until the search settles.
   *
   * Keyed on `searchAttempt` as well as the id: a retry keeps the same id but
   * restarts the search, and the poller stops itself once a status stops changing
   * on its own — without the attempt in the key it would never wake back up.
   */
  useEffect(() => {
    if (!token || !trialId) return;
    return trackTrial(token, trialId, (next) => {
      setTrial(next);
      mergeTrial(next);
    });
  }, [token, trialId, attempt, mergeTrial]);

  /** Ticks the visible countdown between polls. */
  useEffect(() => {
    if (!trial) return;
    setCountdown(trialSecondsLeft(trial));
    if (trial.status !== 'assigned') return;
    const timer = setInterval(() => setCountdown(trialSecondsLeft(trial)), 500);
    return () => clearInterval(timer);
  }, [trial]);

  /**
   * A trainee took it (or the job has already moved past that). The tracking
   * screen owns everything from here — the worker card, the payment and the
   * feedback form.
   *
   * Fires once, guarded by a ref, and the timer is deliberately not torn down on
   * re-render: the poll hands back a fresh `trial` every few seconds, and a
   * cleanup keyed on it would cancel this timeout before it ever fired.
   */
  useEffect(() => {
    if (handedOffRef.current || !trialId) return;
    if (status !== 'accepted' && status !== 'in_progress' && status !== 'completed') return;

    handedOffRef.current = true;
    setHandingOff(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      // The user can still hit Cancel during the beat, and navigating out from
      // under them would be worse than doing nothing.
      if (!aliveRef.current) return;
      router.replace({ pathname: '/trial/track/[id]', params: { id: trialId } });
    }, HANDOFF_MS);
  }, [status, trialId]);

  async function handleCancel() {
    if (!token || !trial) return;
    Alert.alert(
      'Stop the search?',
      'We will call this off. It is free, and it does not use up your trial.',
      [
        { text: 'Keep looking', style: 'cancel' },
        {
          text: 'Stop search',
          style: 'destructive',
          onPress: async () => {
            setBusy('cancel');
            try {
              const updated = await cancelTrial(token, trial.id);
              mergeTrial(updated);
            } catch {
              // The bookings list re-reads from the server, so it catches up.
            }
            // Cancelling releases the allowance, so the offer has to be re-read.
            invalidateTrialOffer();
            refreshTrials();
            router.replace('/(tabs)');
          },
        },
      ]
    );
  }

  async function handleRetry() {
    if (!token || !trial) return;
    setBusy('retry');
    try {
      const result = await retryTrial(token, trial.id);
      setTrial(result.trial);
      mergeTrial(result.trial);
    } catch (err) {
      if (isNoTrialWorkers(err)) {
        Alert.alert(
          'Still nobody nearby',
          'No trainee professional is available in your area right now. Try again in a little while, or book a regular service.'
        );
      } else if (isTrialApiError(err) && err.status === 409) {
        // Already searching again, or moved on — trust the server and re-read.
        const fresh = await getTrial(token, trial.id).catch(() => null);
        if (fresh) {
          setTrial(fresh);
          mergeTrial(fresh);
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

  // ── No trainee nearby ──────────────────────────────────────────────────────
  //
  // Not an error state. Trial supply is inherently thin — it is however many
  // people happen to be mid-onboarding within range — so this gets a real screen
  // and a route back to the normal booking flow.
  if (noWorkers) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <EmptyState
          icon="account-search-outline"
          title="No new professionals nearby"
          message="Nobody is completing their onboarding in your area right now, so there is no discounted trial to book. An experienced professional can come instead."
        >
          <View style={styles.emptyActions}>
            <Button
              label="Book a regular service"
              icon="lightning-bolt"
              fullWidth
              onPress={() => router.replace('/(tabs)')}
            />
            <Button
              label="Back to home"
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        </EmptyState>
      </View>
    );
  }

  // ── Could not even start ───────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title="Could not start the trial" message={error}>
          <Button label="Back to home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  const addressLine = activeAddress
    ? [activeAddress.line, activeAddress.locality].filter(Boolean).join(', ')
    : 'Your address';

  // `assigned` *is* the searching state — there is no `searching` value.
  const searching = !trial || trial.status === 'assigned';
  const spent = trial?.status === 'declined' || trial?.status === 'expired';
  const pricing = trial?.pricing;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + (searching || spent ? 120 : 40) }}
      >
        <MapBackdrop
          height={insets.top + 240}
          radar={searching}
          pulsing={!searching && !spent}
          showExperts={!spent}
          caption={trial?.address || addressLine}
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
                  You already had a trial in progress, so we brought you to that one.
                </Text>
              </View>
            ) : null}

            <View style={styles.headRow}>
              <View
                style={[
                  styles.liveDot,
                  {
                    backgroundColor: spent
                      ? colors.mutedForeground
                      : searching
                        ? colors.warning
                        : colors.success,
                  },
                ]}
              />
              <Text variant="h2" style={styles.flex}>
                {!trial
                  ? 'Placing your trial'
                  : spent
                    ? 'Nobody took it'
                    : searching
                      ? 'Asking a new professional'
                      : 'A new professional accepted'}
              </Text>
              {searching && trial ? (
                <View style={[styles.countdown, { backgroundColor: colors.secondary }]}>
                  <Text variant="h3" style={{ color: colors.secondaryForeground }}>
                    {formatTrialClock(countdown)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text variant="body" tone="muted" style={styles.headSub}>
              {!trial
                ? 'Finding somebody nearby who is completing their onboarding…'
                : spent
                  ? trial.canRetry
                    ? 'Every trainee we asked passed or ran out of time. Searching again builds a fresh queue from whoever is free now.'
                    : 'No trainee professional could take this on. An experienced professional can come instead.'
                  : trial.candidateNumber && trial.candidateCount
                    ? `Asking professional ${trial.candidateNumber} of ${trial.candidateCount} near ${addressLine}. Each gets 90 seconds to answer.`
                    : `Looking near ${addressLine}. This can take a few minutes.`}
            </Text>

            {/* ── Search telemetry ───────────────────────────────────────── */}
            {trial && (searching || spent) ? (
              <>
                <Divider spacingY={spacing.lg} />
                <View style={styles.statRow}>
                  <Stat
                    icon="account-multiple-outline"
                    value={
                      trial.candidateNumber && trial.candidateCount
                        ? `${trial.candidateNumber}/${trial.candidateCount}`
                        : String(trial.candidateCount ?? 1)
                    }
                    label="asked"
                  />
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <Stat icon="timer-sand" value="90s" label="each" />
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <Stat icon="refresh" value={String(trial.searchAttempt)} label="attempt" />
                </View>
              </>
            ) : null}
          </Card>

          {/* ── The offer, restated ────────────────────────────────────────── */}
          {pricing ? (
            <Card tone="tint" padding="lg" style={styles.card}>
              <View style={styles.offerRow}>
                <IconBubble icon="wallet-giftcard" size={44} tone="primary" />
                <View style={styles.flex}>
                  <View style={styles.priceRow}>
                    <Text variant="h2">{formatPrice(pricing.userPrice)}</Text>
                    <Text variant="body" tone="muted" style={styles.strike}>
                      {formatPrice(pricing.basePrice)}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted">
                    {formatPrice(pricing.rewardAmount)} back as a reward · effectively{' '}
                    {formatPrice(netCostOf(pricing))}
                  </Text>
                </View>
              </View>
              <Divider spacingY={spacing.md} />
              <View style={styles.noteRow}>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text variant="caption" style={styles.flex}>
                  After the job you fill a short form — that form is what gets this
                  professional approved.
                </Text>
              </View>
            </Card>
          ) : null}

          {/* ── What was asked for ─────────────────────────────────────────── */}
          {trial ? (
            <Card padding="lg" style={styles.card}>
              <Text variant="captionSemi" tone="muted" style={styles.jobLabel}>
                YOUR REQUEST
              </Text>
              <View style={styles.jobHead}>
                <IconBubble icon={service?.icon ?? 'broom'} size={42} />
                <View style={styles.flex}>
                  <Text variant="bodySemi" numberOfLines={1}>
                    {service?.name ?? 'Cleaning'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Discounted trial · pay after the job
                  </Text>
                </View>
                <Badge label="Trial" tone="success" icon="school-outline" />
              </View>

              {trial.jobDescription ? (
                <>
                  <Divider spacingY={spacing.md} />
                  <View style={styles.noteRow}>
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={16}
                      color={colors.mutedForeground}
                    />
                    <Text variant="body" style={styles.flex}>
                      {trial.jobDescription}
                    </Text>
                  </View>
                </>
              ) : null}
            </Card>
          ) : null}

          {handingOff ? (
            <View style={styles.handoff}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="caption" tone="muted">
                Opening your trial booking
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      {spent && trial ? (
        <BottomBar bottomInset={insets.bottom}>
          {trial.canRetry ? (
            <View style={styles.actionRow}>
              {/* The search already ended by itself, so there is nothing to
                  cancel and this places no booking — it only walks away. */}
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
              label="Book a regular service"
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
            disabled={!trial || busy !== null}
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
  icon: 'account-multiple-outline' | 'timer-sand' | 'refresh';
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
  card: { marginTop: spacing.md },
  emptyActions: { alignSelf: 'stretch', gap: spacing.sm },
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
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  headSub: { marginTop: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  strike: { textDecorationLine: 'line-through' },
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
