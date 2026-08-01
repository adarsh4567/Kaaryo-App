import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { spacing } from '@/constants/theme';
import { CartBar } from '@/components/CartBar';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconBubble,
  Segmented,
  Text,
  type BadgeTone,
} from '@/components/ui';
import { useAppContext, type HistoryEntry } from '@/context/AppContext';
import { formatMinutes, formatPrice, getServiceByKey, type MdiName } from '@/lib/catalog';
import { isLiveRequest, type UserRequest } from '@/lib/userRequests';
import { isLiveTrial, type Trial, type TrialSummary } from '@/lib/userTrials';

/** Local (scheduled) statuses that mean the booking is still running. */
const LIVE_STATUSES = ['searching', 'in_progress', 'pending_rating'];

const STATUS_META: Record<string, { label: string; tone: BadgeTone; icon: MdiName }> = {
  searching: { label: 'Finding expert', tone: 'warning', icon: 'radar' },
  in_progress: { label: 'On the way', tone: 'primary', icon: 'navigation-variant-outline' },
  pending_rating: { label: 'Work done', tone: 'success', icon: 'check-decagram-outline' },
  payment_due: { label: 'Pay now', tone: 'warning', icon: 'cash-clock' },
  completed: { label: 'Completed', tone: 'success', icon: 'check-circle-outline' },
  paid: { label: 'Paid', tone: 'success', icon: 'check-decagram' },
  cancelled: { label: 'Cancelled', tone: 'destructive', icon: 'close-circle-outline' },
  expired: { label: 'No match', tone: 'neutral', icon: 'timer-sand-empty' },
  retryable: { label: 'Try again', tone: 'warning', icon: 'refresh' },
  // Trial-only. `assigned` is a trial's searching state, and `declined` means the
  // whole candidate queue passed — neither word appears in the normal flow.
  assigned: { label: 'Asking trainee', tone: 'warning', icon: 'radar' },
  accepted: { label: 'On the way', tone: 'primary', icon: 'navigation-variant-outline' },
  declined: { label: 'No match', tone: 'neutral', icon: 'timer-sand-empty' },
  rate_now: { label: 'Rate now', tone: 'warning', icon: 'clipboard-text-outline' },
};

type Filter = 'live' | 'past';

/** How long a just-placed booking keeps its ring. */
const HIGHLIGHT_MS = 6000;

/**
 * One booking, whichever backend it came from.
 *
 * The app has three booking families that cannot be merged server-side: instant
 * requests live on `/api/user/service-requests`, discounted trials on
 * `/api/user/trials` with their own status set, and scheduled ones went to the
 * legacy endpoint and only exist on this device. They never collide — a legacy
 * request has no `user`, so it is invisible to the customer endpoints — so the
 * lists concatenate without deduping. Normalising them here keeps that split out
 * of the card.
 */
interface BookingRow {
  id: string;
  /** Which detail screen owns it. */
  route: '/request/[id]' | '/tracking/[id]' | '/trial/track/[id]';
  title: string;
  icon: MdiName;
  /** Key into `STATUS_META`. */
  badge: string;
  subtitle: string;
  facts: { icon: MdiName; label: string }[];
  live: boolean;
  /** Shows a Pay call to action rather than Track. */
  payable: boolean;
  /** Shows Search again rather than Track. */
  retryable: boolean;
  /** Shows a Rate call to action — a trial whose feedback is still outstanding. */
  ratable?: boolean;
  /** Only local rows can be re-added to the cart. */
  rebookKeys?: string[];
  /** ISO timestamp used for newest-first sorting. */
  sortKey: string;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** An instant request → a row. */
function rowFromRequest(request: UserRequest): BookingRow {
  const payable = request.payment.payable;
  const badge = payable
    ? 'payment_due'
    : request.payment.status === 'paid'
      ? 'paid'
      : request.status === 'expired' && request.canRetry
        ? 'retryable'
        : request.status;

  return {
    id: request.id,
    route: '/request/[id]',
    title: request.subcategoryName
      ? `${request.categoryName} · ${request.subcategoryName}`
      : request.categoryName,
    icon: 'lightning-bolt',
    badge,
    subtitle: `Instant · ${formatDay(request.createdAt)}`,
    facts: [
      {
        icon: 'account-hard-hat-outline',
        label: request.worker ? request.worker.name.split(' ')[0] : 'Unassigned',
      },
      { icon: 'currency-inr', label: formatPrice(request.totalPrice) },
      {
        icon: payable ? 'cash-clock' : request.payment.status === 'paid' ? 'check-decagram' : 'cash-multiple',
        label:
          request.payment.status === 'paid'
            ? 'Paid'
            : payable
              ? 'Payment due'
              : 'Pay after',
      },
    ],
    live: isLiveRequest(request),
    payable,
    retryable: request.status === 'expired' && request.canRetry,
    sortKey: request.createdAt,
  };
}

/**
 * A live discounted trial → a row.
 *
 * `feedbackPending` outranks the payment in the badge even though payment is
 * prompted first: an unpaid bill is the customer's own money, but an unrated trial
 * is a real person's onboarding stuck waiting, and this list is the only place
 * they will find their way back to it.
 */
function rowFromTrial(trial: Trial): BookingRow {
  const payable = trial.payment.payable;
  const badge = trial.feedbackPending
    ? 'rate_now'
    : payable
      ? 'payment_due'
      : trial.payment.status === 'paid'
        ? 'paid'
        : (trial.status === 'declined' || trial.status === 'expired') && trial.canRetry
          ? 'retryable'
          : trial.status;

  return {
    id: trial.id,
    route: '/trial/track/[id]',
    title: 'Cleaning · discounted trial',
    icon: 'school-outline',
    badge,
    subtitle: `Trial · ${formatDay(trial.createdAt)}`,
    facts: [
      {
        icon: 'account-hard-hat-outline',
        label: trial.worker ? trial.worker.name.split(' ')[0] : 'Unassigned',
      },
      { icon: 'currency-inr', label: formatPrice(trial.pricing.userPrice) },
      {
        icon: trial.reward.credited ? 'wallet-giftcard' : 'gift-outline',
        label: trial.reward.credited
          ? `${formatPrice(trial.reward.amount)} back`
          : `${formatPrice(trial.pricing.rewardAmount)} reward`,
      },
    ],
    live: isLiveTrial(trial),
    payable,
    retryable: (trial.status === 'declined' || trial.status === 'expired') && trial.canRetry,
    ratable: trial.feedbackPending,
    sortKey: trial.createdAt,
  };
}

/**
 * A past trial → a row.
 *
 * History rows are a compact shape, not a `Trial`: no worker, no description and
 * a flat `paymentStatus` instead of a payment object. Kept as its own mapper so
 * neither one has to be cast to the other.
 */
function rowFromTrialSummary(summary: TrialSummary): BookingRow {
  return {
    id: summary.id,
    route: '/trial/track/[id]',
    title: 'Cleaning · discounted trial',
    icon: 'school-outline',
    badge:
      summary.paymentStatus === 'paid' && summary.feedbackSubmitted
        ? 'paid'
        : summary.canRetry
          ? 'retryable'
          : summary.status,
    subtitle: `Trial · ${formatDay(summary.createdAt)}`,
    facts: [
      { icon: 'currency-inr', label: formatPrice(summary.userPrice) },
      {
        icon: summary.rewardCredited ? 'wallet-giftcard' : 'gift-outline',
        label: summary.rewardCredited
          ? `${formatPrice(summary.rewardAmount)} back`
          : 'No reward',
      },
      {
        icon: summary.feedbackSubmitted ? 'clipboard-check-outline' : 'clipboard-outline',
        label: summary.feedbackSubmitted ? 'Rated' : 'Not rated',
      },
    ],
    live: false,
    payable: false,
    retryable: summary.canRetry,
    sortKey: summary.createdAt,
  };
}

/** A locally-stored scheduled booking → a row. */
function rowFromHistory(entry: HistoryEntry): BookingRow {
  const lead = getServiceByKey(entry.serviceKeys[0]);
  return {
    id: entry.id,
    route: '/tracking/[id]',
    title: entry.title,
    icon: lead?.icon ?? 'clipboard-text-outline',
    badge: entry.status,
    subtitle: `${entry.mode === 'instant' ? 'Instant' : (entry.slot ?? 'Scheduled')} · ${formatDay(entry.createdAt)}`,
    facts: [
      {
        icon: 'clipboard-list-outline',
        label: `${entry.itemCount} ${entry.itemCount === 1 ? 'task' : 'tasks'}`,
      },
      { icon: 'clock-outline', label: formatMinutes(entry.minutes) },
      { icon: 'currency-inr', label: formatPrice(entry.total) },
    ],
    live: LIVE_STATUSES.includes(entry.status),
    payable: false,
    retryable: false,
    rebookKeys: entry.serviceKeys,
    sortKey: entry.createdAt,
  };
}

export default function BookingsScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const {
    history,
    addToCart,
    liveRequests,
    pastRequests,
    isLoadingRequests,
    refreshRequests,
    activeTrials,
    trialHistory,
    isLoadingTrials,
    refreshTrials,
  } = useAppContext();
  const params = useLocalSearchParams<{ filter?: string; highlight?: string }>();
  const [filter, setFilter] = useState<Filter>('live');
  const [highlight, setHighlight] = useState<string | null>(null);

  /**
   * Instant dispatch hands off to this tab once it has a booking, asking for the
   * Live filter and pointing at the new entry.
   *
   * Tabs stay mounted, so that arrives as a parameter change rather than a fresh
   * mount — and `highlight` carrying the booking id is what makes the effect
   * re-fire when the same filter is asked for twice in a row.
   */
  useEffect(() => {
    if (params.filter === 'live' || params.filter === 'past') setFilter(params.filter);
    if (!params.highlight) return;
    setHighlight(params.highlight);
    // The ring says "this is the one you just placed", so it has to expire —
    // otherwise it is still there next week when the user opens the tab.
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [params.filter, params.highlight]);

  const { live, past } = useMemo(() => {
    const liveRequestIds = new Set(liveRequests.map((r) => r.id));
    const requestRows = [
      ...liveRequests.map(rowFromRequest),
      ...pastRequests.filter((r) => !liveRequestIds.has(r.id)).map(rowFromRequest),
    ];

    // `activeTrials` is what the server calls active; a settled one in there is
    // routed to History by `live`, same as any other row.
    const activeTrialIds = new Set(activeTrials.map((t) => t.id));
    const trialRows = [
      ...activeTrials.map(rowFromTrial),
      ...trialHistory.filter((t) => !activeTrialIds.has(t.id)).map(rowFromTrialSummary),
    ];
    const historyRows = history.map(rowFromHistory);
    // Sort newest-first so History shows the most recent booking at the top.
    const all = [...requestRows, ...trialRows, ...historyRows].sort(
      (a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime(),
    );
    return {
      live: all.filter((r) => r.live),
      past: all.filter((r) => !r.live),
    };
  }, [liveRequests, pastRequests, activeTrials, trialHistory, history]);

  const shown = filter === 'live' ? live : past;
  const total = live.length + past.length;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text variant="display">My bookings</Text>
        <Text variant="body" tone="muted" style={styles.headerSub}>
          {total === 0 ? 'Nothing booked yet' : `${live.length} live · ${past.length} completed`}
        </Text>

        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          style={styles.segmented}
          options={[
            { value: 'live', label: `Live${live.length ? ` (${live.length})` : ''}` },
            { value: 'past', label: `History${past.length ? ` (${past.length})` : ''}` },
          ]}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.tabBarPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingRequests || isLoadingTrials}
            onRefresh={() => {
              refreshRequests();
              refreshTrials();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={filter === 'live' ? 'clipboard-clock-outline' : 'clipboard-text-outline'}
            title={filter === 'live' ? 'No live bookings' : 'No past bookings'}
            message={
              filter === 'live'
                ? 'Book a task and you can track your professional here, minute by minute.'
                : 'Completed and cancelled bookings will be listed here.'
            }
          >
            <Button label="Book a service" onPress={() => router.push('/(tabs)')} />
          </EmptyState>
        ) : (
          <View style={styles.stack}>
            {shown.map((row, idx) => (
              <BookingCard
                key={`${row.route}:${row.id}:${idx}`}
                row={row}
                highlighted={row.id === highlight}
                onPress={() => router.push({ pathname: row.route, params: { id: row.id } })}
                onRebook={() => {
                  row.rebookKeys?.forEach((serviceKey) => addToCart(serviceKey));
                  router.push('/cart');
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CartBar bottomInset={insets.bottom} />
    </View>
  );
}

function BookingCard({
  row,
  onPress,
  onRebook,
  highlighted,
}: {
  row: BookingRow;
  onPress: () => void;
  onRebook: () => void;
  /** Ringed because the user has just this second placed it. */
  highlighted?: boolean;
}) {
  const { colors } = useTheme();
  const meta = STATUS_META[row.badge] ?? STATUS_META.expired;

  return (
    <Card
      padding="lg"
      onPress={onPress}
      style={highlighted ? { borderWidth: 1.5, borderColor: colors.primary } : undefined}
    >
      <View style={styles.cardTop}>
        <IconBubble icon={row.icon} size={46} tone={row.live ? 'primary' : 'tint'} />
        <View style={styles.flex}>
          <Text variant="bodySemi" numberOfLines={1}>
            {row.title}
          </Text>
          <Text variant="caption" tone="muted">
            {row.subtitle}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} icon={meta.icon} />
      </View>

      <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
        {row.facts.map((fact) => (
          <MetaCell key={fact.label + fact.icon} icon={fact.icon} label={fact.label} />
        ))}
      </View>

      <View style={styles.cardActions}>
        {/* Ahead of Pay: an unrated trial is somebody's onboarding waiting, and
            the two are independent server-side — paying does not clear it. */}
        {row.ratable ? (
          <Button
            label="Rate now"
            icon="clipboard-text-outline"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        ) : row.payable ? (
          <Button
            label="Pay now"
            icon="cash-multiple"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        ) : row.retryable ? (
          <Button
            label="Search again"
            icon="refresh"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        ) : row.live ? (
          <Button
            label="Track booking"
            iconRight="arrow-right"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        ) : row.rebookKeys?.length ? (
          <Button
            label="Book again"
            icon="repeat-variant"
            variant="secondary"
            size="sm"
            style={styles.flex}
            onPress={onRebook}
          />
        ) : (
          <Button
            label="View receipt"
            icon="receipt"
            variant="secondary"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        )}
      </View>
    </Card>
  );
}

function MetaCell({ icon, label }: { icon: MdiName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metaCell}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.mutedForeground} />
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  headerSub: { marginTop: 2 },
  segmented: { marginTop: spacing.lg },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  stack: { gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaCell: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
