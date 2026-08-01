import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/HeroHeader';
import {
  Badge,
  BottomBar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBubble,
  Segmented,
  Stepper,
  Text,
} from '@/components/ui';
import { PLATFORM_FEE, useAppContext, type BookingMode } from '@/context/AppContext';
import { createServiceRequest, type RequestItem } from '@/lib/api';
import { formatMinutes, formatPrice, getGroup } from '@/lib/catalog';
import { buildSlots } from '@/lib/slots';

export default function CartScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const {
    profile,
    cartLines,
    itemCount,
    subtotal,
    totalMinutes,
    incrementItem,
    decrementItem,
    clearCart,
    mode,
    setMode,
    scheduledSlot,
    setScheduledSlot,
    appliedCoupon,
    couponCode,
    discount,
    total,
    activeAddress,
    addToHistory,
  } = useAppContext();

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const slots = useMemo(() => buildSlots(8), []);

  /** Repairs and deep cleaning cannot be dispatched in 10 minutes. */
  const instantBlockedBy = cartLines.find((line) => !getGroup(line.service.group).supportsInstant);
  const effectiveMode: BookingMode = instantBlockedBy ? 'schedule' : mode;
  const needsSlot = effectiveMode === 'schedule' && !scheduledSlot;

  if (itemCount === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <ScreenHeader title="My cart" topInset={insets.top} onBack={() => router.back()} />
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          message="Add a task and an expert can be at your door in ten minutes."
        >
          <Button label="Browse services" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  async function handlePay() {
    if (!profile?.fullName) {
      setError('Add your name in Account before booking.');
      return;
    }
    if (!activeAddress) {
      setError('Add a service address to continue.');
      return;
    }
    // Dispatch is purely geographic, so an address with no coordinates would be
    // booked at 0,0 and never reach a worker. Block rather than send a bad fix.
    if (typeof activeAddress.lat !== 'number' || typeof activeAddress.lng !== 'number') {
      setError('This address has no location pinned. Please re-add it from the address screen.');
      return;
    }
    if (needsSlot) {
      setError('Pick a time slot for your scheduled booking.');
      return;
    }

    setPlacing(true);
    setError('');

    const items: RequestItem[] = cartLines.map((line) => ({
      serviceKey: line.service.key,
      serviceName: line.service.name,
      durationKey: line.duration.key,
      durationLabel: line.duration.label,
      quantity: line.quantity,
      unitPrice: line.duration.price,
      minutes: line.duration.minutes,
    }));

    // The backend contract is single-category, so the first task leads and the
    // full task list is restated in the description for the expert to read.
    const jobDescription = [
      ...cartLines.map(
        (line) =>
          `${line.quantity}× ${line.service.name} (${line.duration.label}) — ${formatPrice(line.lineTotal)}`
      ),
      `Total ${formatMinutes(totalMinutes)} · ${formatPrice(total)} · ${
        effectiveMode === 'instant' ? 'Instant' : `Scheduled for ${scheduledSlot}`
      }`,
    ].join('\n');

    try {
      const response = await createServiceRequest({
        // From the verified profile, not a local form — this is what the worker
        // sees, and what links the booking to the account server-side.
        customerName: profile.fullName,
        customerPhone: profile.phone,
        category: cartLines[0].service.key,
        subcategory: cartLines[0].duration.key,
        jobDescription,
        lat: activeAddress.lat,
        lng: activeAddress.lng,
        address: [activeAddress.line, activeAddress.locality, activeAddress.city]
          .filter(Boolean)
          .join(', '),
        items,
        mode: effectiveMode,
        scheduledFor: effectiveMode === 'schedule' ? scheduledSlot : null,
        quotedTotal: total,
        estimatedMinutes: totalMinutes,
      });

      const lead = cartLines[0].service.name;
      await addToHistory({
        id: response.request.id,
        title: cartLines.length > 1 ? `${lead} + ${cartLines.length - 1} more` : lead,
        serviceKeys: cartLines.map((l) => l.service.key),
        itemCount,
        total,
        minutes: totalMinutes,
        mode: effectiveMode,
        slot: effectiveMode === 'schedule' ? (scheduledSlot ?? undefined) : undefined,
        createdAt: response.request.createdAt,
        status: 'searching',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await clearCart();
      router.replace({ pathname: '/tracking/[id]', params: { id: response.request.id } });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not place the booking. Check the API URL in Account.'
      );
      setPlacing(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="My cart"
        subtitle={`${itemCount} ${itemCount === 1 ? 'task' : 'tasks'} · ${formatMinutes(totalMinutes)}`}
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 130 }]}
      >
        {/* ── Dispatch mode ────────────────────────────────────────────────── */}
        <Segmented<BookingMode>
          value={effectiveMode}
          onChange={setMode}
          options={[
            { value: 'instant', label: 'Instant', icon: 'lightning-bolt' },
            { value: 'schedule', label: 'Schedule', icon: 'calendar-clock' },
          ]}
        />

        {instantBlockedBy ? (
          <Card tone="warning" padding="md" style={styles.notice}>
            <View style={styles.noticeRow}>
              <MaterialCommunityIcons
                name="information-outline"
                size={17}
                color={colors.warning}
              />
              <Text variant="caption" style={[styles.flex, { color: colors.warning }]}>
                {instantBlockedBy.service.name} needs machines and a fixed slot, so this booking
                is scheduled rather than instant.
              </Text>
            </View>
          </Card>
        ) : effectiveMode === 'instant' ? (
          <Card tone="tint" padding="md" style={styles.notice}>
            <View style={styles.noticeRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={17} color={colors.primary} />
              <Text variant="caption" style={[styles.flex, { color: colors.secondaryForeground }]}>
                An expert reaches you in about 10 minutes of confirming.
              </Text>
            </View>
          </Card>
        ) : null}

        {/* ── Slot picker ──────────────────────────────────────────────────── */}
        {effectiveMode === 'schedule' ? (
          <>
            <Text variant="h3" style={styles.sectionTitle}>
              Pick a time
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.slotBleed}
              contentContainerStyle={styles.slotRow}
            >
              {slots.map((slot) => (
                <Chip
                  key={slot.key}
                  label={slot.day}
                  sublabel={slot.time}
                  selected={scheduledSlot === slot.label}
                  onPress={() => setScheduledSlot(slot.label)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* ── Line items ───────────────────────────────────────────────────── */}
        <Text variant="h3" style={styles.sectionTitle}>
          Review booking
        </Text>
        <Card padding="none">
          {cartLines.map((line, i) => (
            <View key={line.id}>
              {i > 0 ? <View style={[styles.hairline, { backgroundColor: colors.border }]} /> : null}
              <View style={styles.lineRow}>
                <IconBubble icon={line.service.icon} size={44} />
                <View style={styles.flex}>
                  <Text variant="bodySemi" numberOfLines={1}>
                    {line.service.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {line.duration.label}
                  </Text>
                  <Text variant="captionSemi" tone="primary" style={styles.linePrice}>
                    {formatPrice(line.lineTotal)}
                  </Text>
                </View>
                <Stepper
                  value={line.quantity}
                  onIncrement={() => incrementItem(line.id)}
                  onDecrement={() => decrementItem(line.id)}
                  compact
                />
              </View>
            </View>
          ))}

          <View style={[styles.hairline, { backgroundColor: colors.border }]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/service/search')}
            style={({ pressed }) => [styles.addMore, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
            <Text variant="bodySemi" tone="primary">
              Missed something? Add more
            </Text>
          </Pressable>
        </Card>

        {/* ── Coupon ───────────────────────────────────────────────────────── */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/coupons')}
          style={({ pressed }) => [
            styles.couponRow,
            {
              backgroundColor: appliedCoupon ? colors.successLight : colors.card,
              borderColor: appliedCoupon ? colors.success : colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="ticket-percent-outline"
            size={20}
            color={appliedCoupon ? colors.success : colors.primary}
          />
          <View style={styles.flex}>
            <Text variant="bodySemi">
              {appliedCoupon ? `${appliedCoupon.code} applied` : 'View all coupons'}
            </Text>
            <Text variant="caption" tone="muted">
              {appliedCoupon
                ? `You saved ${formatPrice(appliedCoupon.discount)} on this booking`
                : couponCode
                  ? `${couponCode} needs a higher cart value`
                  : 'Offers and savings available'}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        </Pressable>

        {/* ── Booking details ──────────────────────────────────────────────── */}
        <Text variant="h3" style={styles.sectionTitle}>
          Booking details
        </Text>
        <Card padding="lg">
          <DetailRow
            icon="map-marker-outline"
            label="Location"
            value={
              activeAddress
                ? [activeAddress.line, activeAddress.locality, activeAddress.city]
                    .filter(Boolean)
                    .join(', ')
                : 'No address added yet'
            }
            actionLabel={activeAddress ? 'Change' : 'Add'}
            onAction={() => router.push('/address')}
          />
          <Divider spacingY={spacing.md} />
          <DetailRow
            icon="account-outline"
            label="Contact"
            value={
              profile
                ? `${profile.fullName ?? 'Name not set'} · ${profile.phoneFormatted}`
                : 'Not signed in'
            }
            actionLabel="Edit"
            onAction={() => router.push('/(tabs)/profile')}
          />
          <Divider spacingY={spacing.md} />
          <DetailRow
            icon="cash-multiple"
            label="Payment"
            value="Cash or UPI, after the job is done"
          />
        </Card>

        {/* ── Bill ─────────────────────────────────────────────────────────── */}
        <Text variant="h3" style={styles.sectionTitle}>
          Bill summary
        </Text>
        <Card padding="lg">
          <BillRow label={`Task total (${itemCount})`} value={formatPrice(subtotal)} />
          {discount > 0 ? (
            <BillRow
              label={`Coupon ${appliedCoupon?.code ?? ''}`}
              value={`− ${formatPrice(discount)}`}
              tone="success"
            />
          ) : null}
          <BillRow label="Convenience fee" value={formatPrice(PLATFORM_FEE)} />
          <Divider spacingY={spacing.md} />
          <View style={styles.billRow}>
            <Text variant="h3">To pay</Text>
            <Text variant="h3">{formatPrice(total)}</Text>
          </View>
          <Text variant="caption" tone="muted" style={styles.billNote}>
            No advance, no per-room multipliers. Extra time is charged only if you approve it.
          </Text>
        </Card>

        {error ? (
          <Card tone="destructive" padding="md" style={styles.notice}>
            <View style={styles.noticeRow}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color={colors.destructive}
              />
              <Text variant="caption" style={[styles.flex, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      {/* ── Pay bar ────────────────────────────────────────────────────────── */}
      <BottomBar bottomInset={insets.bottom}>
        <View style={styles.payRow}>
          <View>
            <Text variant="h2">{formatPrice(total)}</Text>
            <Text variant="caption" tone="muted">
              {effectiveMode === 'instant'
                ? 'Arriving in ~10 min'
                : (scheduledSlot ?? 'Pick a slot above')}
            </Text>
          </View>
          <Button
            label={placing ? 'Booking…' : needsSlot ? 'Select a slot' : 'Pay now'}
            iconRight={needsSlot ? undefined : 'arrow-right'}
            loading={placing}
            disabled={placing || needsSlot}
            style={styles.flex}
            onPress={handlePay}
          />
        </View>
      </BottomBar>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
  actionLabel,
  onAction,
}: {
  icon: 'map-marker-outline' | 'account-outline' | 'cash-multiple';
  label: string;
  value: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.mutedForeground} />
      <View style={styles.flex}>
        <Text variant="captionSemi" tone="muted">
          {label}
        </Text>
        <Text variant="body" numberOfLines={2}>
          {value}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text variant="captionSemi" tone="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BillRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <View style={styles.billRow}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text variant="bodySemi" tone={tone === 'success' ? 'success' : 'default'}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  notice: { marginTop: spacing.md },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  slotBleed: { marginHorizontal: -spacing.lg },
  slotRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  hairline: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  linePrice: { marginTop: 2 },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  billNote: { marginTop: spacing.sm },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
});
