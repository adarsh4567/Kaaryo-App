import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import {
  Badge,
  BottomBar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBubble,
  Rating,
  Text,
} from '@/components/ui';
import {
  formatMinutes,
  formatPrice,
  getGroup,
  getServiceByKey,
  getServicesByGroup,
  PROMISES,
} from '@/lib/catalog';

/** The three steps every booking follows, shown on each service page. */
const STEPS = [
  { title: 'Add to cart', detail: 'Stack as many tasks as you need' },
  { title: 'Confirm address', detail: 'We find the nearest available expert' },
  { title: 'Expert arrives', detail: 'Track live and pay once the job is done' },
] as const;

export default function ServiceDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { addToCart, quantityForService, itemCount } = useAppContext();

  const service = getServiceByKey(key);
  const [durationKey, setDurationKey] = useState(service?.durations[0]?.key ?? '');

  if (!service) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="help-circle-outline"
          title="Service not found"
          message="This service is no longer available in your area."
        >
          <Button label="Back to home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    );
  }

  const group = getGroup(service.group);
  const duration =
    service.durations.find((d) => d.key === durationKey) ?? service.durations[0];
  const inCart = quantityForService(service.key);
  const related = getServicesByGroup(service.group)
    .filter((s) => s.key !== service.key)
    .slice(0, 6);

  // An arrow const keeps the `service` narrowing from the guard above; a hoisted
  // function declaration would not.
  const handleAdd = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(service.key, duration.key);
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: colors.heroBackground }]}>
          <View style={[styles.heroBlob, styles.heroBlobA, { backgroundColor: colors.primary }]} />
          <View style={[styles.heroBlob, styles.heroBlobB, { backgroundColor: colors.primary }]} />

          <View style={[styles.heroBar, { paddingTop: insets.top + spacing.sm }]}>
            <HeroCircleButton icon="arrow-left" label="Go back" onPress={() => router.back()} />
            <View style={styles.flex} />
            <HeroCircleButton
              icon="cart-outline"
              label={`Cart, ${itemCount} items`}
              onPress={() => router.push('/cart')}
              badge={itemCount}
            />
          </View>

          <View style={styles.heroArt}>
            <MaterialCommunityIcons
              name={service.icon}
              size={92}
              color={colors.heroForeground}
              style={styles.heroIcon}
            />
          </View>
        </View>

        {/* ── Title block ────────────────────────────────────────────────── */}
        <View style={styles.body}>
          <Card padding="lg" style={styles.titleCard}>
            <View style={styles.titleRow}>
              <View style={styles.flex}>
                {service.offer ? (
                  <Badge label={service.offer} tone="destructive" style={styles.offerBadge} />
                ) : null}
                <Text variant="h1">{service.name}</Text>
                <Text variant="body" tone="muted" style={styles.tagline}>
                  {service.tagline}
                </Text>
              </View>
              <Button
                label={inCart > 0 ? `ADDED ${inCart}` : 'ADD'}
                variant={inCart > 0 ? 'primary' : 'outline'}
                size="sm"
                onPress={handleAdd}
              />
            </View>

            <View style={styles.metaRow}>
              <Rating value={service.rating} size={13} />
              <Text variant="captionSemi">{service.rating.toFixed(1)}</Text>
              <View style={[styles.dot, { backgroundColor: colors.border }]} />
              <Text variant="caption" tone="muted">
                {service.bookings}
              </Text>
              <View style={[styles.dot, { backgroundColor: colors.border }]} />
              <Text variant="caption" tone="muted">
                {group.supportsInstant ? 'Arrives in 10 min' : 'Scheduled slots'}
              </Text>
            </View>

            <Divider spacingY={spacing.lg} />

            <Text variant="body" tone="muted">
              {service.description}
            </Text>
          </Card>

          {/* ── Duration ─────────────────────────────────────────────────── */}
          <Text variant="h2" style={styles.sectionTitle}>
            {service.durations.length > 1 ? 'Choose a slot' : 'Pricing'}
          </Text>
          <View style={styles.chipRow}>
            {service.durations.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                sublabel={
                  option.price === 0
                    ? 'Free'
                    : option.strikePrice
                      ? `${formatPrice(option.price)}  ·  was ${formatPrice(option.strikePrice)}`
                      : formatPrice(option.price)
                }
                selected={option.key === duration.key}
                onPress={() => setDurationKey(option.key)}
                style={styles.chip}
              />
            ))}
          </View>

          {/* ── Included ─────────────────────────────────────────────────── */}
          <Text variant="h2" style={styles.sectionTitle}>
            What’s included
          </Text>
          <Card padding="lg">
            {service.includes.map((item, i) => (
              <View
                key={item}
                style={[styles.includeRow, i > 0 && { marginTop: spacing.md }]}
              >
                <View style={[styles.tick, { backgroundColor: colors.successLight }]}>
                  <MaterialCommunityIcons name="check" size={13} color={colors.success} />
                </View>
                <Text variant="body" style={styles.flex}>
                  {item}
                </Text>
              </View>
            ))}
          </Card>

          {/* ── Promises ─────────────────────────────────────────────────── */}
          <Text variant="h2" style={styles.sectionTitle}>
            Good to know
          </Text>
          <View style={styles.promiseStack}>
            {PROMISES.slice(0, 3).map((promise) => (
              <Card key={promise.title} tone="tint" padding="md" style={styles.promiseCard}>
                <IconBubble icon={promise.icon} size={40} tone="primary" />
                <View style={styles.flex}>
                  <Text variant="bodySemi" style={{ color: colors.secondaryForeground }}>
                    {promise.title}
                  </Text>
                  <Text variant="caption" style={{ color: colors.secondaryForeground }}>
                    {promise.detail}
                  </Text>
                </View>
              </Card>
            ))}
          </View>

          {/* ── How it works ─────────────────────────────────────────────── */}
          <Text variant="h2" style={styles.sectionTitle}>
            How it works
          </Text>
          <Card padding="lg">
            {STEPS.map((step, i) => (
              <View key={step.title} style={styles.stepRow}>
                <View style={styles.stepGutter}>
                  <View style={[styles.stepBullet, { backgroundColor: colors.primary }]}>
                    <Text variant="micro" tone="onPrimary">
                      {i + 1}
                    </Text>
                  </View>
                  {i < STEPS.length - 1 ? (
                    <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                  ) : null}
                </View>
                <View style={[styles.flex, styles.stepBody]}>
                  <Text variant="bodySemi">{step.title}</Text>
                  <Text variant="caption" tone="muted">
                    {step.detail}
                  </Text>
                </View>
              </View>
            ))}
          </Card>

          {/* ── Related ──────────────────────────────────────────────────── */}
          {related.length > 0 ? (
            <>
              <Text variant="h2" style={styles.sectionTitle}>
                Often booked together
              </Text>
              <View style={styles.relatedStack}>
                {related.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/service/[key]', params: { key: item.key } })
                    }
                    style={({ pressed }) => [
                      styles.relatedRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <IconBubble icon={item.icon} size={42} />
                    <View style={styles.flex}>
                      <Text variant="bodySemi" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {item.price === 0 ? 'Free visit' : `from ${formatPrice(item.price)}`} ·{' '}
                        {formatMinutes(item.durations[0].minutes)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${item.name}`}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        addToCart(item.key);
                      }}
                      hitSlop={8}
                      style={[styles.relatedAdd, { borderColor: colors.primary }]}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Sticky action bar ────────────────────────────────────────────── */}
      <BottomBar bottomInset={insets.bottom}>
        <View style={styles.barRow}>
          <View>
            <View style={styles.barPriceRow}>
              <Text variant="h2">
                {duration.price === 0 ? 'Free' : formatPrice(duration.price)}
              </Text>
              {duration.strikePrice ? (
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ textDecorationLine: 'line-through' }}
                >
                  {formatPrice(duration.strikePrice)}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" tone="muted">
              {duration.label}
            </Text>
          </View>
          {inCart > 0 ? (
            <Button
              label="Go to cart"
              iconRight="arrow-right"
              style={styles.flex}
              onPress={() => router.push('/cart')}
            />
          ) : (
            <Button label="Add to cart" icon="plus" style={styles.flex} onPress={handleAdd} />
          )}
        </View>
      </BottomBar>
    </View>
  );
}

/** Translucent circular button for the dark hero. */
function HeroCircleButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: 'arrow-left' | 'cart-outline';
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroCircle,
        {
          backgroundColor: colors.onHeroSurface,
          borderColor: colors.onHeroBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={19} color={colors.heroForeground} />
      {badge && badge > 0 ? (
        <View style={[styles.heroBadge, { backgroundColor: colors.primary }]}>
          <Text variant="micro" tone="onPrimary">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  hero: {
    paddingBottom: spacing['3xl'],
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    overflow: 'hidden',
  },
  heroBlob: { position: 'absolute', borderRadius: 999, opacity: 0.18 },
  heroBlobA: { width: 220, height: 220, top: -90, right: -70 },
  heroBlobB: { width: 150, height: 150, bottom: -70, left: -40 },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  heroCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArt: { alignItems: 'center', paddingTop: spacing.xl },
  heroIcon: { opacity: 0.95 },
  body: { paddingHorizontal: spacing.lg },
  // Overlaps the hero's rounded bottom edge.
  titleCard: { marginTop: -spacing['2xl'] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  offerBadge: { marginBottom: spacing.sm },
  tagline: { marginTop: 3 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  dot: { width: 3, height: 3, borderRadius: 2 },
  sectionTitle: { marginTop: spacing['2xl'], marginBottom: spacing.md },
  chipRow: { gap: spacing.sm },
  chip: { alignSelf: 'stretch' },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseStack: { gap: spacing.sm },
  promiseCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepGutter: { alignItems: 'center' },
  stepBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: 1.5, flex: 1, marginVertical: 4 },
  stepBody: { paddingBottom: spacing.lg },
  relatedStack: { gap: spacing.sm },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  relatedAdd: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  barPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
});
