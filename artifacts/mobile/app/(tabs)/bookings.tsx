import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
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

/** Statuses that mean the booking is still running. */
const LIVE_STATUSES = ['searching', 'in_progress', 'pending_rating'];

const STATUS_META: Record<string, { label: string; tone: BadgeTone; icon: MdiName }> = {
  searching: { label: 'Finding expert', tone: 'warning', icon: 'radar' },
  in_progress: { label: 'On the way', tone: 'primary', icon: 'navigation-variant-outline' },
  pending_rating: { label: 'Confirm & pay', tone: 'success', icon: 'check-decagram-outline' },
  completed: { label: 'Completed', tone: 'success', icon: 'check-circle-outline' },
  cancelled: { label: 'Cancelled', tone: 'destructive', icon: 'close-circle-outline' },
  expired: { label: 'No match', tone: 'neutral', icon: 'timer-sand-empty' },
};

type Filter = 'live' | 'past';

export default function BookingsScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { history, addToCart } = useAppContext();
  const [filter, setFilter] = useState<Filter>('live');

  const { live, past } = useMemo(() => {
    return {
      live: history.filter((h) => LIVE_STATUSES.includes(h.status)),
      past: history.filter((h) => !LIVE_STATUSES.includes(h.status)),
    };
  }, [history]);

  const shown = filter === 'live' ? live : past;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text variant="display">My bookings</Text>
        <Text variant="body" tone="muted" style={styles.headerSub}>
          {history.length === 0
            ? 'Nothing booked yet'
            : `${live.length} live · ${past.length} completed`}
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
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={filter === 'live' ? 'clipboard-clock-outline' : 'clipboard-text-outline'}
            title={filter === 'live' ? 'No live bookings' : 'No past bookings'}
            message={
              filter === 'live'
                ? 'Book a task and you can track your expert here, minute by minute.'
                : 'Completed and cancelled bookings will be listed here.'
            }
          >
            <Button label="Book a service" onPress={() => router.push('/(tabs)')} />
          </EmptyState>
        ) : (
          <View style={styles.stack}>
            {shown.map((entry) => (
              <BookingCard
                key={entry.id}
                entry={entry}
                onPress={() =>
                  router.push({ pathname: '/tracking/[id]', params: { id: entry.id } })
                }
                onRebook={() => {
                  entry.serviceKeys.forEach((serviceKey) => addToCart(serviceKey));
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
  entry,
  onPress,
  onRebook,
}: {
  entry: HistoryEntry;
  onPress: () => void;
  onRebook: () => void;
}) {
  const { colors } = useTheme();
  const meta = STATUS_META[entry.status] ?? STATUS_META.expired;
  const isLive = LIVE_STATUSES.includes(entry.status);

  const date = new Date(entry.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const leadService = getServiceByKey(entry.serviceKeys[0]);

  return (
    <Card padding="lg" onPress={onPress}>
      <View style={styles.cardTop}>
        <IconBubble
          icon={leadService?.icon ?? 'clipboard-text-outline'}
          size={46}
          tone={isLive ? 'primary' : 'tint'}
        />
        <View style={styles.flex}>
          <Text variant="bodySemi" numberOfLines={1}>
            {entry.title}
          </Text>
          <Text variant="caption" tone="muted">
            {entry.mode === 'instant' ? 'Instant' : (entry.slot ?? 'Scheduled')} · {date}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} icon={meta.icon} />
      </View>

      <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
        <MetaCell
          icon="clipboard-list-outline"
          label={`${entry.itemCount} ${entry.itemCount === 1 ? 'task' : 'tasks'}`}
        />
        <MetaCell icon="clock-outline" label={formatMinutes(entry.minutes)} />
        <MetaCell icon="currency-inr" label={formatPrice(entry.total)} />
      </View>

      <View style={styles.cardActions}>
        {isLive ? (
          <Button
            label="Track booking"
            iconRight="arrow-right"
            size="sm"
            style={styles.flex}
            onPress={onPress}
          />
        ) : (
          <Button
            label="Book again"
            icon="repeat-variant"
            variant="secondary"
            size="sm"
            style={styles.flex}
            onPress={onRebook}
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
