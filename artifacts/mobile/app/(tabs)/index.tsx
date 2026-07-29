import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { HeroHeader, HeroSearchBar } from '@/components/HeroHeader';
import { MapBackdrop } from '@/components/MapBackdrop';
import { CartBar } from '@/components/CartBar';
import { ServiceRailCard, ServiceTile } from '@/components/ServiceTile';
import {
  Badge,
  Button,
  Card,
  IconBubble,
  Rating,
  SectionHeader,
  Text,
} from '@/components/ui';
import {
  BUNDLES,
  formatMinutes,
  formatPrice,
  getPopularServices,
  getServicesByGroup,
  PROMISES,
  REVIEWS,
  SERVICE_GROUPS,
  TRUST_STATS,
  type Bundle,
  type Service,
} from '@/lib/catalog';

/** Arrival promise shown in the hero badge, in minutes. */
const INSTANT_ETA = 10;

/** Experts shown as "near you" in the map caption. */
const NEARBY_EXPERTS = 34;

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const insets = useScreenInsets();
  const { width } = useWindowDimensions();
  const {
    user,
    isLoadingUser,
    activeAddress,
    history,
    credits,
    mode,
    setMode,
    addToCart,
    addBundleToCart,
    quantityForService,
  } = useAppContext();

  useEffect(() => {
    if (!isLoadingUser && !user) router.replace('/onboarding');
  }, [user, isLoadingUser]);

  if (isLoadingUser) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!user) return null;

  const activeBooking = history.find((h) =>
    ['searching', 'in_progress', 'pending_rating'].includes(h.status)
  );

  // Three tiles per row within the 16pt gutter, separated by a 10pt gap.
  const tileWidth = (width - spacing.lg * 2 - 10 * 2) / 3;
  const popular = getPopularServices();

  function openService(serviceKey: string) {
    router.push({ pathname: '/service/[key]', params: { key: serviceKey } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.tabBarPadding + 40 }}
      >
        <HeroHeader
          topInset={insets.top}
          eta={INSTANT_ETA}
          locality={activeAddress?.label ?? 'Set location'}
          addressLine={
            activeAddress
              ? [activeAddress.line, activeAddress.locality, activeAddress.city]
                  .filter(Boolean)
                  .join(', ')
              : 'Tap to add your address'
          }
          initial={(user.name || 'K')[0].toUpperCase()}
          credits={credits}
          onPressLocation={() => router.push('/address')}
          onPressProfile={() => router.push('/(tabs)/profile')}
          onPressCredits={() => router.push('/coupons')}
        >
          <HeroSearchBar
            onPress={() => router.push('/service/search')}
            placeholder="Search mopping, bathroom, laundry…"
          />
        </HeroHeader>

        {/* ── Locate ─────────────────────────────────────────────────────── */}
        <MapBackdrop
          height={188}
          caption={
            activeAddress
              ? `${NEARBY_EXPERTS} experts near ${activeAddress.locality}`
              : 'Add an address to see experts near you'
          }
        />

        <View style={styles.sheet}>
          {/* ── Dispatch mode ───────────────────────────────────────────── */}
          <View style={styles.modeRow}>
            <ModeCard
              active={mode === 'schedule'}
              title="Schedule"
              subtitle="Pick your time"
              icon="calendar-clock"
              onPress={() => setMode('schedule')}
            />
            <ModeCard
              active={mode === 'instant'}
              title="Instant"
              subtitle="Get help now"
              icon="lightning-bolt"
              onPress={() => setMode('instant')}
            />
          </View>

          {/* ── Live booking ────────────────────────────────────────────── */}
          {activeBooking ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/tracking/[id]', params: { id: activeBooking.id } })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.liveCard,
                { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
              ]}
            >
              <View style={[styles.liveDot, { backgroundColor: colors.primaryForeground }]} />
              <View style={styles.flex}>
                <Text variant="bodySemi" tone="onPrimary" numberOfLines={1}>
                  {activeBooking.status === 'searching'
                    ? 'Finding an expert near you'
                    : activeBooking.status === 'in_progress'
                      ? 'Your expert is on the way'
                      : 'Work done — confirm and pay'}
                </Text>
                <Text
                  variant="caption"
                  style={{ color: colors.onHeroMuted }}
                  numberOfLines={1}
                >
                  {activeBooking.title}
                </Text>
              </View>
              <Text variant="captionSemi" tone="onPrimary">
                Track
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.primaryForeground}
              />
            </Pressable>
          ) : null}

          {/* ── Bundles ─────────────────────────────────────────────────── */}
          <SectionHeader
            title="Exclusive bundles"
            subtitle="Stack tasks into one visit and save"
            style={styles.sectionTop}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railBleed}
          >
            {BUNDLES.map((bundle) => (
              <BundleCard
                key={bundle.key}
                bundle={bundle}
                width={width - spacing.lg * 2 - 36}
                onAdd={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  addBundleToCart(bundle.key);
                }}
              />
            ))}
          </ScrollView>

          {/* ── Most booked ─────────────────────────────────────────────── */}
          <SectionHeader
            title="One expert who can do it all"
            subtitle="The tasks families book most"
            style={styles.sectionTop}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railBleed}
          >
            {popular.map((service) => (
              <ServiceRailCard
                key={service.key}
                service={service}
                width={264}
                inCart={quantityForService(service.key) > 0}
                onPress={() => openService(service.key)}
                onAdd={() => addToCart(service.key)}
              />
            ))}
          </ScrollView>

          {/* ── Full catalog, by group ──────────────────────────────────── */}
          {SERVICE_GROUPS.map((group) => (
            <View key={group.key}>
              <SectionHeader
                title={group.title}
                subtitle={group.subtitle}
                style={styles.sectionTop}
              />
              <View style={styles.grid}>
                {getServicesByGroup(group.key).map((service: Service) => (
                  <ServiceTile
                    key={service.key}
                    service={service}
                    width={tileWidth}
                    quantity={quantityForService(service.key)}
                    onPress={() => openService(service.key)}
                    onAdd={() => addToCart(service.key)}
                  />
                ))}
              </View>
            </View>
          ))}

          {/* ── Promises ────────────────────────────────────────────────── */}
          <SectionHeader
            title="The Kaaryo promise"
            subtitle="Why 12 lakh families let us in"
            style={styles.sectionTop}
          />
          <View style={styles.grid}>
            {PROMISES.map((promise) => (
              <Card
                key={promise.title}
                padding="md"
                style={{ width: (width - spacing.lg * 2 - 10) / 2 }}
              >
                <IconBubble icon={promise.icon} size={38} />
                <Text variant="bodySemi" style={styles.promiseTitle}>
                  {promise.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {promise.detail}
                </Text>
              </Card>
            ))}
          </View>

          {/* ── Trust stats ─────────────────────────────────────────────── */}
          <Card tone="hero" padding="lg" bordered={false} style={styles.statsCard}>
            <View style={styles.statsRow}>
              {TRUST_STATS.map((stat, i) => (
                <React.Fragment key={stat.label}>
                  {i > 0 ? (
                    <View
                      style={[styles.statDivider, { backgroundColor: colors.onHeroBorder }]}
                    />
                  ) : null}
                  <View style={styles.stat}>
                    <MaterialCommunityIcons
                      name={stat.icon}
                      size={16}
                      color={colors.onHeroMuted}
                    />
                    <Text variant="h3" tone="onHero">
                      {stat.value}
                    </Text>
                    <Text variant="micro" style={{ color: colors.onHeroMuted }} center>
                      {stat.label}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </Card>

          {/* ── Reviews ─────────────────────────────────────────────────── */}
          <SectionHeader
            title="What your neighbours say"
            subtitle="4.8 average across 62 lakh bookings"
            style={styles.sectionTop}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railBleed}
          >
            {REVIEWS.map((review) => (
              <Card key={review.name} padding="lg" style={styles.reviewCard}>
                <Rating value={review.rating} size={14} />
                <Text variant="body" style={styles.quote}>
                  “{review.quote}”
                </Text>
                <Text variant="captionSemi">{review.name}</Text>
                <Text variant="caption" tone="muted">
                  {review.locality}
                </Text>
              </Card>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={15}
              color={colors.mutedForeground}
            />
            <Text variant="caption" tone="muted">
              Verified experts · Pay after the job
            </Text>
          </View>
          <Text variant="caption" tone="muted" center style={{ opacity: isDark ? 0.5 : 0.7 }}>
            Kaaryo · Made for Indian homes
          </Text>
        </View>
      </ScrollView>

      <CartBar bottomInset={insets.bottom} />
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/**
 * Instant vs Schedule selector. This is a setting, not navigation — it decides
 * how the cart is dispatched at checkout, so the active card fills with green.
 */
function ModeCard({
  active,
  title,
  subtitle,
  icon,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: 'calendar-clock' | 'lightning-bolt';
  onPress: () => void;
}) {
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.modeCard,
        shadow.sm,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.modeIcon,
          { backgroundColor: active ? colors.onHeroSurface : colors.secondary },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={19}
          color={active ? colors.primaryForeground : colors.secondaryForeground}
        />
      </View>
      <Text variant="h3" tone={active ? 'onPrimary' : 'default'}>
        {title}
      </Text>
      <Text
        variant="caption"
        style={{ color: active ? colors.onHeroMuted : colors.mutedForeground }}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

function BundleCard({
  bundle,
  width,
  onAdd,
}: {
  bundle: Bundle;
  width: number;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card tone="hero" padding="lg" bordered={false} style={{ width }}>
      <View style={styles.bundleTop}>
        <View style={styles.flex}>
          <Badge label={bundle.badge} tone="onHero" />
          <Text variant="h3" tone="onHero" style={styles.bundleTitle}>
            {bundle.name}
          </Text>
          <Text variant="caption" style={{ color: colors.onHeroMuted }}>
            {bundle.description}
          </Text>
        </View>
        <View
          style={[
            styles.bundleArt,
            { backgroundColor: colors.onHeroSurface, borderColor: colors.onHeroBorder },
          ]}
        >
          <MaterialCommunityIcons name={bundle.icon} size={34} color={colors.heroForeground} />
        </View>
      </View>

      <View style={styles.bundleFooter}>
        <View>
          <View style={styles.bundlePriceRow}>
            <Text variant="h3" tone="onHero">
              {formatPrice(bundle.price)}
            </Text>
            <Text
              variant="caption"
              style={{ color: colors.onHeroMuted, textDecorationLine: 'line-through' }}
            >
              {formatPrice(bundle.strikePrice)}
            </Text>
          </View>
          <Text variant="caption" style={{ color: colors.onHeroMuted }}>
            {formatMinutes(bundle.minutes)} · one expert
          </Text>
        </View>
        <Button label="Add bundle" variant="onHero" size="sm" icon="plus" onPress={onAdd} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Pulls the mode cards up so they overlap the map, as a sheet would.
  sheet: { paddingHorizontal: spacing.lg, marginTop: -spacing['2xl'] },
  modeRow: { flexDirection: 'row', gap: spacing.md },
  modeCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  liveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.lg,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  sectionTop: { marginTop: spacing['2xl'] },
  // Rails bleed to the screen edge so the next card peeks in from the right.
  railBleed: { marginHorizontal: -spacing.lg },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  promiseTitle: { marginTop: spacing.sm, marginBottom: 2 },
  statsCard: { marginTop: spacing['2xl'] },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 38 },
  reviewCard: { width: 268 },
  quote: { marginTop: spacing.sm, marginBottom: spacing.md },
  bundleTop: { flexDirection: 'row', gap: spacing.md },
  bundleTitle: { marginTop: spacing.sm, marginBottom: 3 },
  bundleArt: {
    width: 62,
    height: 62,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bundleFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  bundlePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing['3xl'],
    marginBottom: spacing.sm,
  },
});
