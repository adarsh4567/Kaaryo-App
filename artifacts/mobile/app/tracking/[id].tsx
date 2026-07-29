import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
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
import { cancelServiceRequest, trackRequest, type ServiceRequest } from '@/lib/api';
import { formatPrice, getServiceByKey } from '@/lib/catalog';

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { apiUrl, updateHistoryStatus, history } = useAppContext();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const stopPollingRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const apiUrlRef = useRef(apiUrl);
  const idRef = useRef(id);

  useEffect(() => {
    apiUrlRef.current = apiUrl;
  }, [apiUrl]);
  useEffect(() => {
    idRef.current = id;
  }, [id]);

  function startPolling() {
    const requestId = idRef.current;
    if (!requestId) return;
    stopPollingRef.current = trackRequest(
      apiUrlRef.current,
      requestId,
      (next) => {
        setRequest((prev) => {
          if (prev && prev.status !== next.status) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            updateHistoryStatus(next.id, next.status);
          }
          return next;
        });
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        setFetchError(err.message);
        setLoading(false);
      }
    );
  }

  useEffect(() => {
    startPolling();
    return () => stopPollingRef.current?.();
  }, []);

  // Polling is suspended in the background and restarted on foreground so a
  // returning user sees fresh state immediately rather than after one interval.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        stopPollingRef.current?.();
        startPolling();
      } else if (next.match(/inactive|background/)) {
        stopPollingRef.current?.();
      }
      appStateRef.current = next;
    });
    return () => subscription.remove();
  }, []);

  function handleCancel() {
    const expert = request?.worker?.name;
    Alert.alert(
      'Cancel this booking?',
      expert
        ? `${expert} is already on the way. Cancelling now may affect your account standing.`
        : 'We will stop looking for an expert.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setCancelling(true);
            try {
              const updated = await cancelServiceRequest(id);
              setRequest(updated);
              updateHistoryStatus(id, 'cancelled');
              stopPollingRef.current?.();
            } catch (err) {
              Alert.alert(
                'Could not cancel',
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }

  const entry = history.find((h) => h.id === id);
  const leadService = getServiceByKey(request?.category ?? entry?.serviceKeys[0]);
  const title = entry?.title ?? leadService?.name ?? 'Your booking';

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── Unreachable ────────────────────────────────────────────────────────────
  if (fetchError && !request) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title="Booking" topInset={insets.top} />
        <EmptyState
          icon="cloud-off-outline"
          title="Could not load this booking"
          message={fetchError}
        >
          <Button label="Go home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  if (!request) return null;

  // ── Searching ──────────────────────────────────────────────────────────────
  if (request.status === 'searching') {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title={title} subtitle="Finding your expert" topInset={insets.top} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        >
          <MapBackdrop height={230} pulsing caption={request.address || 'Your address'} />

          <View style={styles.body}>
            <Card padding="lg" style={styles.searchCard}>
              <View style={styles.searchTop}>
                <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                <Text variant="h2" style={styles.flex}>
                  Finding an expert near you
                </Text>
              </View>
              <Text variant="body" tone="muted" style={styles.searchSub}>
                We are notifying verified experts within {request.radiusKm} km. This usually takes
                under three minutes.
              </Text>

              <Divider spacingY={spacing.lg} />

              <View style={styles.statRow}>
                <Stat value={String(request.wave)} label="Search wave" />
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <Stat value={String(request.workersNotified)} label="Experts notified" />
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <Stat value={`${request.radiusKm} km`} label="Radius" />
              </View>
            </Card>

            <JobCard request={request} />
          </View>
        </ScrollView>

        <BottomBar bottomInset={insets.bottom}>
          <Button
            label={cancelling ? 'Cancelling…' : 'Cancel booking'}
            variant="destructive"
            icon="close"
            fullWidth
            haptic={false}
            loading={cancelling}
            onPress={handleCancel}
          />
        </BottomBar>
      </View>
    );
  }

  // ── Expert assigned ────────────────────────────────────────────────────────
  if (request.status === 'in_progress' && request.worker) {
    const expert = request.worker;
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title={title} subtitle="Expert on the way" topInset={insets.top} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        >
          <MapBackdrop height={200} caption={request.address || 'Your address'} />

          <View style={styles.body}>
            <Card padding="lg" style={styles.searchCard}>
              <View style={styles.expertTop}>
                <View style={[styles.expertAvatar, { backgroundColor: colors.secondary }]}>
                  <Text variant="h1" style={{ color: colors.secondaryForeground }}>
                    {expert.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="h3" numberOfLines={1}>
                    {expert.name}
                  </Text>
                  <View style={styles.expertMeta}>
                    <Rating value={expert.rating} size={12} />
                    <Text variant="caption" tone="muted">
                      {expert.rating.toFixed(1)} · {expert.jobsCompleted} jobs
                    </Text>
                  </View>
                  <Badge
                    label={`${expert.distanceKm} km away`}
                    tone="primary"
                    icon="navigation-variant-outline"
                    style={styles.expertBadge}
                  />
                </View>
              </View>

              <Divider spacingY={spacing.lg} />

              <View style={styles.expertActions}>
                <Button
                  label={`Call ${expert.name.split(' ')[0]}`}
                  icon="phone"
                  style={styles.flex}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(`tel:${expert.phone}`);
                  }}
                />
                <Button
                  label="Chat"
                  icon="message-text-outline"
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      'Chat coming soon',
                      `For now, call ${expert.name.split(' ')[0]} on ${expert.phone}.`
                    )
                  }
                />
              </View>
            </Card>

            {/* The start code only exists when the backend issues one. */}
            {request.otp ? (
              <Card tone="tint" padding="lg" bordered={false} style={styles.otpCard}>
                <Text variant="captionSemi" style={{ color: colors.secondaryForeground }}>
                  SHARE THIS START CODE
                </Text>
                <View style={styles.otpRow}>
                  {request.otp.split('').map((digit, i) => (
                    <View
                      key={`${digit}-${i}`}
                      style={[styles.otpDigit, { backgroundColor: colors.card }]}
                    >
                      <Text variant="h2" tone="primary">
                        {digit}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text variant="caption" style={{ color: colors.secondaryForeground }}>
                  Read it out only once your expert has arrived.
                </Text>
              </Card>
            ) : null}

            <ProgressCard status={request.status} />
            <JobCard request={request} />
          </View>
        </ScrollView>

        <BottomBar bottomInset={insets.bottom}>
          <Button
            label={cancelling ? 'Cancelling…' : 'Cancel booking'}
            variant="destructive"
            icon="close"
            fullWidth
            haptic={false}
            loading={cancelling}
            onPress={handleCancel}
          />
        </BottomBar>
      </View>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (request.status === 'pending_rating' || request.status === 'completed') {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TrackHeader title={title} subtitle="Work completed" topInset={insets.top} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}
        >
          <View style={styles.resultTop}>
            <IconBubble icon="check-decagram" size={86} tone="primary" />
            <Text variant="h1" center style={styles.resultTitle}>
              All done!
            </Text>
            <Text variant="body" tone="muted" center>
              {request.worker
                ? `${request.worker.name} has finished the job.`
                : 'Your expert has finished the job.'}
            </Text>
          </View>

          <Card tone="hero" padding="lg" bordered={false}>
            <Text variant="caption" style={{ color: colors.onHeroMuted }}>
              Amount to pay
            </Text>
            <Text variant="display" tone="onHero">
              {formatPrice(request.totalPrice)}
            </Text>
            <View style={styles.payRow}>
              <MaterialCommunityIcons
                name="cash-multiple"
                size={16}
                color={colors.onHeroMuted}
              />
              <Text variant="caption" style={{ color: colors.onHeroMuted }}>
                Pay your expert in cash or by UPI
              </Text>
            </View>
          </Card>

          {request.worker ? (
            <Card padding="lg" style={styles.rateCard}>
              <Text variant="h3">Rate {request.worker.name.split(' ')[0]}</Text>
              <Text variant="caption" tone="muted" style={styles.rateSub}>
                Your rating decides which experts we send next time.
              </Text>
              <View style={styles.rateStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${star} stars`}
                    hitSlop={6}
                    onPress={() => {
                      Haptics.selectionAsync();
                      Alert.alert('Thanks!', `You rated this booking ${star} out of 5.`);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="star-outline"
                      size={34}
                      color={colors.star}
                    />
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          <JobCard request={request} />
        </ScrollView>

        <BottomBar bottomInset={insets.bottom}>
          <Button
            label="Done"
            iconRight="arrow-right"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
          />
        </BottomBar>
      </View>
    );
  }

  // ── Cancelled / expired ────────────────────────────────────────────────────
  const isCancelled = request.status === 'cancelled';
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <TrackHeader
        title={title}
        subtitle={isCancelled ? 'Cancelled' : 'No expert available'}
        topInset={insets.top}
      />
      <EmptyState
        icon={isCancelled ? 'close-circle-outline' : 'timer-sand-empty'}
        title={isCancelled ? 'Booking cancelled' : 'No experts available'}
        message={
          isCancelled
            ? 'This booking was cancelled. Nothing has been charged.'
            : 'No expert within 15 km could take this up right now. Try a scheduled slot instead.'
        }
      >
        <Button
          label={isCancelled ? 'Book again' : 'Try scheduling'}
          onPress={() => router.replace('/(tabs)')}
        />
      </EmptyState>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** Tracking screens replace the stack, so the header goes home, not back. */
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
        accessibilityLabel="Go to home"
        hitSlop={8}
        onPress={() => router.replace('/(tabs)')}
        style={({ pressed }) => [
          styles.headerBtn,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="home-outline" size={19} color={colors.foreground} />
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption" tone="muted" center>
        {label}
      </Text>
    </View>
  );
}

/** Three-step timeline of where the booking has reached. */
function ProgressCard({ status }: { status: ServiceRequest['status'] }) {
  const { colors } = useTheme();
  const steps = [
    { label: 'Booking confirmed', done: true },
    { label: 'Expert assigned', done: true },
    {
      label: 'Work in progress',
      done: status === 'pending_rating' || status === 'completed',
    },
  ];

  return (
    <Card padding="lg" style={styles.progressCard}>
      {steps.map((step, i) => (
        <View key={step.label} style={styles.progressRow}>
          <View style={styles.progressGutter}>
            <View
              style={[
                styles.progressDot,
                {
                  backgroundColor: step.done ? colors.primary : colors.muted,
                  borderColor: step.done ? colors.primary : colors.border,
                },
              ]}
            >
              {step.done ? (
                <MaterialCommunityIcons
                  name="check"
                  size={11}
                  color={colors.primaryForeground}
                />
              ) : null}
            </View>
            {i < steps.length - 1 ? (
              <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
            ) : null}
          </View>
          <Text
            variant={step.done ? 'bodySemi' : 'body'}
            tone={step.done ? 'default' : 'muted'}
            style={styles.progressLabel}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function JobCard({ request }: { request: ServiceRequest }) {
  const { colors } = useTheme();
  return (
    <Card padding="lg" style={styles.jobCard}>
      <Text variant="captionSemi" tone="muted" style={styles.jobLabel}>
        BOOKING DETAILS
      </Text>
      <Text variant="body">{request.jobDescription}</Text>

      <Divider spacingY={spacing.md} />

      <View style={styles.jobRow}>
        <MaterialCommunityIcons
          name="map-marker-outline"
          size={17}
          color={colors.mutedForeground}
        />
        <Text variant="body" style={styles.flex}>
          {request.address || 'Location captured'}
        </Text>
      </View>

      <Divider spacingY={spacing.md} />

      <View style={styles.jobRow}>
        <MaterialCommunityIcons
          name="cash-multiple"
          size={17}
          color={colors.mutedForeground}
        />
        <Text variant="body" style={styles.flex}>
          {formatPrice(request.totalPrice)} · pay after the job
        </Text>
      </View>
    </Card>
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
  // Overlaps the map so the card reads as a sheet over it.
  searchCard: { marginTop: -spacing.xl },
  searchTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchSub: { marginTop: spacing.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  expertTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  expertAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expertMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  expertBadge: { marginTop: spacing.sm },
  expertActions: { flexDirection: 'row', gap: spacing.sm },
  otpCard: { marginTop: spacing.md, alignItems: 'center', gap: spacing.md },
  otpRow: { flexDirection: 'row', gap: spacing.sm },
  otpDigit: {
    width: 44,
    height: 52,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCard: { marginTop: spacing.md },
  progressRow: { flexDirection: 'row', gap: spacing.md },
  progressGutter: { alignItems: 'center' },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLine: { width: 1.5, flex: 1, marginVertical: 3 },
  progressLabel: { paddingBottom: spacing.lg },
  jobCard: { marginTop: spacing.md },
  jobLabel: { letterSpacing: 0.8, marginBottom: spacing.sm },
  jobRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  resultTop: { alignItems: 'center', paddingTop: spacing['2xl'], marginBottom: spacing.xl },
  resultTitle: { marginTop: spacing.lg, marginBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  rateCard: { marginTop: spacing.md },
  rateSub: { marginTop: 3 },
  rateStars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
});
