import React, { useEffect, useState } from 'react';
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
import { invalidateTrialOffer } from '@/hooks/useTrialOffer';
import { radii, spacing } from '@/constants/theme';
import { MapBackdrop } from '@/components/MapBackdrop';
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
  cancelTrial,
  formatTrialClock,
  getTrial,
  isNoTrialWorkers,
  netCostOf,
  payForTrial,
  retryTrial,
  trackTrial,
  trialSecondsLeft,
  type PaymentMethod,
  type Trial,
} from '@/lib/userTrials';
import { formatPrice, type MdiName } from '@/lib/catalog';

/** Payment rails the server accepts, in the order Indian customers reach for them. */
const METHODS: { key: PaymentMethod; label: string; detail: string; icon: MdiName }[] = [
  { key: 'upi', label: 'UPI', detail: 'GPay, PhonePe, Paytm', icon: 'cellphone-check' },
  { key: 'cash', label: 'Cash', detail: 'Hand it to your professional', icon: 'cash' },
  { key: 'card', label: 'Card', detail: 'Debit or credit', icon: 'credit-card-outline' },
  { key: 'netbanking', label: 'Net banking', detail: 'All major banks', icon: 'bank-outline' },
  { key: 'wallet', label: 'Wallet', detail: 'Prepaid balance', icon: 'wallet-outline' },
];

/** Where a trial is in its life, for the timeline. */
const STEPS: { label: string; reached: (t: Trial) => boolean }[] = [
  { label: 'Trial booked', reached: () => true },
  { label: 'Professional assigned', reached: (t) => !!t.acceptedAt || !!t.worker },
  { label: 'Work finished', reached: (t) => t.status === 'completed' },
  { label: 'Paid', reached: (t) => t.payment.status === 'paid' },
  { label: 'Feedback submitted', reached: (t) => t.feedbackSubmitted },
];

/**
 * Tracking, payment and the feedback hand-off for a discounted trial.
 *
 * Payment and feedback both unlock at `completed` and are **independent**. This
 * screen prompts for payment first because money is time-sensitive, but never
 * gates the feedback form behind it: that form is what decides whether a real
 * person finishes their onboarding, and losing it to an unpaid bill would be the
 * worst outcome available here.
 *
 * Every button is rendered from the server's own flags — `payment.payable`,
 * `feedbackPending`, `canCancel`, `canRetry` — and none of them is re-derived from
 * `status`, which would put a client-side copy of the rules on a slow drift out
 * of sync.
 */
export default function TrialTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token, mergeTrial, refreshTrials } = useAppContext();

  const [trial, setTrial] = useState<Trial | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [busy, setBusy] = useState<'cancel' | 'retry' | 'pay' | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState('');
  const [rewardJustCredited, setRewardJustCredited] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const attempt = trial?.searchAttempt;

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;

    getTrial(token, id)
      .then((fresh) => {
        if (cancelled) return;
        setTrial(fresh);
        mergeTrial(fresh);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 404 is also what a trial owned by somebody else returns, on purpose,
        // so ids cannot be enumerated. Either way it is gone.
        setFetchError(err instanceof Error ? err.message : 'This trial is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, id, mergeTrial]);

  // Keyed on `searchAttempt` too, so a retry restarts a poller that had stopped.
  useEffect(() => {
    if (!token || !id || loading) return;
    return trackTrial(token, id, (next) => {
      setTrial(next);
      mergeTrial(next);
    });
  }, [token, id, attempt, loading, mergeTrial]);

  useEffect(() => {
    if (!trial) return;
    setCountdown(trialSecondsLeft(trial));
    if (trial.status !== 'assigned') return;
    const timer = setInterval(() => setCountdown(trialSecondsLeft(trial)), 500);
    return () => clearInterval(timer);
  }, [trial]);

  async function handleCancel() {
    if (!token || !trial) return;
    const assigned = trial.worker?.name;
    Alert.alert(
      'Cancel this trial?',
      assigned
        ? `${assigned.split(' ')[0]} is on the way. Cancelling is free and does not use up your trial — they go back into the onboarding queue.`
        : 'We will stop looking. This is free and does not use up your trial.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel trial',
          style: 'destructive',
          onPress: async () => {
            setBusy('cancel');
            try {
              const updated = await cancelTrial(token, trial.id);
              setTrial(updated);
              mergeTrial(updated);
              // Cancelling releases the allowance, so the offer is stale.
              invalidateTrialOffer();
              refreshTrials();
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
    if (!token || !trial) return;
    setBusy('retry');
    try {
      const result = await retryTrial(token, trial.id);
      setTrial(result.trial);
      mergeTrial(result.trial);
    } catch (err) {
      Alert.alert(
        'Could not search again',
        isNoTrialWorkers(err)
          ? 'No trainee professional is available in your area right now. Try again in a little while, or book a regular service.'
          : err instanceof Error
            ? err.message
            : 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * Initiate then confirm, as one tap — the same contract as a normal booking.
   *
   * The ₹40 reward is created inside confirm, so a successful pay is also the
   * moment the wallet credit exists. `rewardCredited` is false on a replay, which
   * is why the success copy reads off the trial's own `reward.credited` instead.
   */
  async function handlePay(method: PaymentMethod) {
    if (!token || !trial) return;
    setBusy('pay');
    setPayError('');
    try {
      const result = await payForTrial(token, trial.id, method);
      setTrial(result.trial);
      mergeTrial(result.trial);
      if (result.rewardCredited) setRewardJustCredited(true);
      if (result.trial.payment.status === 'paid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPayOpen(false);
        refreshTrials();
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
      // The 402 body carries the updated trial, so re-read to pick up the failure
      // reason and the fact that it is still payable.
      const fresh = await getTrial(token, trial.id).catch(() => null);
      if (fresh) {
        setTrial(fresh);
        mergeTrial(fresh);
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
          Loading your trial…
        </Text>
      </View>
    );
  }

  if (!trial) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title="Trial booking" topInset={insets.top} />
        <EmptyState
          icon="cloud-off-outline"
          title="Could not load this trial"
          message={fetchError || 'This trial is no longer available.'}
        >
          <Button label="Go home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  const worker = trial.worker;
  const paid = trial.payment.status === 'paid';
  const searching = trial.status === 'assigned';
  const spent = trial.status === 'declined' || trial.status === 'expired';
  const cancelled = trial.endedReason === 'customer_cancelled';
  const pricing = trial.pricing;

  // ── Ended: cancelled, or nobody took it and nothing left to try ────────────
  //
  // A customer cancellation lands on `declined` with `endedReason` set, and the
  // server may well still report `canRetry` — the allowance was never spent. But
  // "Nobody took it · Search again" is the wrong story to tell somebody who just
  // cancelled on purpose, so cancelling ends the screen and re-booking goes back
  // through the sheet, which re-reads the offer.
  if (spent && (cancelled || !trial.canRetry)) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader
          title="Trial booking"
          subtitle={cancelled ? 'Cancelled' : 'No match'}
          topInset={insets.top}
        />
        <EmptyState
          icon={cancelled ? 'close-circle-outline' : 'account-search-outline'}
          title={cancelled ? 'Trial cancelled' : 'No new professionals available'}
          message={
            cancelled
              ? 'This trial was cancelled. Nothing has been charged, and your discounted trial is still yours to use.'
              : 'Nobody completing their onboarding could take this on. An experienced professional can come instead.'
          }
        >
          <Button label="Book a service" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <TrackHeader
        title="Discounted trial"
        subtitle={
          searching
            ? 'Asking a new professional'
            : spent
              ? 'Nobody accepted'
              : trial.feedbackPending
                ? 'Work done — your feedback is needed'
                : trial.payment.payable
                  ? 'Work done — payment due'
                  : paid
                    ? 'Paid'
                    : 'Professional on the way'
        }
        topInset={insets.top}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <MapBackdrop
          height={searching ? 220 : 190}
          radar={searching}
          pulsing={!searching && !spent}
          showExperts={!spent}
          caption={trial.address || 'Your address'}
        />

        <View style={styles.body}>
          {/* ── Searching ────────────────────────────────────────────────── */}
          {searching ? (
            <Card padding="lg" style={styles.headCard}>
              <View style={styles.headRow}>
                <View style={[styles.liveDot, { backgroundColor: colors.warning }]} />
                <Text variant="h2" style={styles.flex}>
                  Asking a new professional
                </Text>
                <View style={[styles.countdown, { backgroundColor: colors.secondary }]}>
                  <Text variant="h3" style={{ color: colors.secondaryForeground }}>
                    {formatTrialClock(countdown)}
                  </Text>
                </View>
              </View>
              <Text variant="body" tone="muted" style={styles.headSub}>
                {trial.candidateNumber && trial.candidateCount
                  ? `Asking professional ${trial.candidateNumber} of ${trial.candidateCount}, one at a time. `
                  : ''}
                You can leave this screen — we will keep looking.
              </Text>
            </Card>
          ) : null}

          {/* ── Spent, retryable ─────────────────────────────────────────── */}
          {spent ? (
            <Card padding="lg" style={styles.headCard}>
              <Text variant="h2">Nobody took it</Text>
              <Text variant="body" tone="muted" style={styles.headSub}>
                Every trainee we asked passed or ran out of time. Searching again builds a fresh
                queue from whoever is free now — there is no limit on how often you can try.
              </Text>
            </Card>
          ) : null}

          {/* ── The professional ─────────────────────────────────────────── */}
          {worker ? (
            <Card padding="lg" style={styles.headCard}>
              <View style={styles.workerTop}>
                <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                  <Text variant="h1" style={{ color: colors.secondaryForeground }}>
                    {worker.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="h3" numberOfLines={1}>
                    {worker.name}
                  </Text>
                  <View style={styles.workerMeta}>
                    {/* A trainee has no ratings yet — that reads "New", not 0, and
                        it is the honest description of who is coming. */}
                    {worker.rating != null ? (
                      <>
                        <Rating value={worker.rating} size={12} />
                        <Text variant="caption" tone="muted">
                          {worker.rating.toFixed(1)} · {worker.jobsCompleted} jobs
                        </Text>
                      </>
                    ) : (
                      <Text variant="caption" tone="muted">
                        New · {worker.jobsCompleted} jobs so far
                      </Text>
                    )}
                  </View>
                  <View style={styles.badgeRow}>
                    {worker.isTrainee ? (
                      <Badge label="Completing onboarding" tone="success" icon="school-outline" />
                    ) : null}
                    <Badge
                      label={`${worker.distanceKm} km away`}
                      tone="primary"
                      icon="navigation-variant-outline"
                    />
                  </View>
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
                    Linking.openURL(
                      `https://wa.me/91${worker.phone.replace(/\D/g, '').slice(-10)}`
                    )
                  }
                />
              </View>
            </Card>
          ) : null}

          {/* ── Feedback: the whole point of the flow ────────────────────────
              Above the bill on purpose. The payment has a bottom bar of its own,
              while this is the step that decides somebody's onboarding — and the
              one the customer has no other reason to remember. */}
          {trial.feedbackPending ? (
            <Card tone="tint" padding="lg" style={styles.card}>
              <View style={styles.offerRow}>
                <IconBubble icon="clipboard-check-outline" size={44} tone="primary" />
                <View style={styles.flex}>
                  <Text variant="h3">
                    {worker ? `Help ${worker.name.split(' ')[0]} get onboarded` : 'Rate this job'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    10 quick questions. Your answers are what decide whether they are approved
                    as a Kaaryo professional.
                  </Text>
                </View>
              </View>
              <Button
                label="Fill the feedback form"
                icon="clipboard-text-outline"
                fullWidth
                style={styles.cardButton}
                onPress={() =>
                  router.push({ pathname: '/trial/feedback/[id]', params: { id: trial.id } })
                }
              />
            </Card>
          ) : trial.feedbackSubmitted ? (
            <Card padding="lg" style={styles.card}>
              <View style={styles.noteRow}>
                <MaterialCommunityIcons name="check-decagram" size={18} color={colors.success} />
                <Text variant="caption" tone="muted" style={styles.flex}>
                  Thanks — your feedback has been sent to the onboarding team.
                </Text>
              </View>
            </Card>
          ) : null}

          {/* ── Progress ─────────────────────────────────────────────────── */}
          {!searching && !spent ? (
            <Card padding="lg" style={styles.card}>
              {STEPS.map((step, i) => {
                const done = step.reached(trial);
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
                <View style={styles.priceRow}>
                  <Text variant="display">{formatPrice(trial.payment.amount)}</Text>
                  <Text variant="body" tone="muted" style={styles.strike}>
                    {formatPrice(pricing.basePrice)}
                  </Text>
                </View>
              </View>
              {paid ? <IconBubble icon="check-decagram" size={48} tone="primary" /> : null}
            </View>

            <Divider spacingY={spacing.md} />

            {/* The reward is the reason the customer took this offer, so it is
                stated before it lands as well as after. */}
            <View style={styles.noteRow}>
              <MaterialCommunityIcons
                name="wallet-giftcard"
                size={16}
                color={trial.reward.credited ? colors.success : colors.mutedForeground}
              />
              <Text
                variant="caption"
                tone={trial.reward.credited ? 'success' : 'muted'}
                style={styles.flex}
              >
                {trial.reward.credited
                  ? `${formatPrice(trial.reward.amount)} reward added to your wallet${
                      rewardJustCredited ? ' just now' : ''
                    }.`
                  : `${formatPrice(pricing.rewardAmount)} comes back as a wallet reward when you pay — effectively ${formatPrice(netCostOf(pricing))}.`}
              </Text>
            </View>

            {paid && trial.payment.transactionId ? (
              <>
                <Divider spacingY={spacing.md} />
                <Text variant="caption" tone="muted">
                  {trial.payment.method?.toUpperCase()} · {trial.payment.transactionId}
                </Text>
              </>
            ) : trial.payment.failureReason ? (
              <>
                <Divider spacingY={spacing.md} />
                <View style={styles.noteRow}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.destructive}
                  />
                  <Text variant="caption" tone="destructive" style={styles.flex}>
                    {trial.payment.failureReason}
                  </Text>
                </View>
              </>
            ) : null}

            {trial.reward.credited ? (
              <Button
                label="View wallet"
                variant="secondary"
                icon="wallet-outline"
                size="sm"
                style={styles.cardButton}
                onPress={() => router.push('/wallet')}
              />
            ) : null}
          </Card>

          {/* ── Job detail ───────────────────────────────────────────────── */}
          <Card padding="lg" style={styles.card}>
            <Text variant="captionSemi" tone="muted" style={styles.jobLabel}>
              BOOKING DETAILS
            </Text>
            <Text variant="body">{trial.jobDescription || 'Home cleaning'}</Text>
            <Divider spacingY={spacing.md} />
            <View style={styles.noteRow}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={17}
                color={colors.mutedForeground}
              />
              <Text variant="body" style={styles.flex}>
                {trial.address || 'Location captured'}
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <BottomBar bottomInset={insets.bottom}>
        {trial.feedbackPending ? (
          <Button
            label="Rate your professional"
            icon="clipboard-text-outline"
            fullWidth
            onPress={() =>
              router.push({ pathname: '/trial/feedback/[id]', params: { id: trial.id } })
            }
          />
        ) : trial.payment.payable ? (
          <Button
            label={`Pay ${formatPrice(trial.payment.amount)}`}
            icon="cash-multiple"
            fullWidth
            onPress={() => {
              setPayError('');
              setPayOpen(true);
            }}
          />
        ) : spent && trial.canRetry ? (
          <View style={styles.actionRow}>
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
        ) : trial.canCancel ? (
          <Button
            label={busy === 'cancel' ? 'Cancelling…' : 'Cancel trial'}
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
          <Text variant="h2">Pay {formatPrice(trial.payment.amount)}</Text>
          <Text variant="caption" tone="muted">
            {formatPrice(pricing.rewardAmount)} comes straight back to your wallet.
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
  cardButton: { marginTop: spacing.lg },
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
  workerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  workerActions: { flexDirection: 'row', gap: spacing.sm },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  strike: { textDecorationLine: 'line-through' },
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
