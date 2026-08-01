import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { CartBar } from '@/components/CartBar';
import { InstantBookingSheet } from '@/components/InstantBookingSheet';
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
  getGroup,
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

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const insets = useScreenInsets();
  const { width } = useWindowDimensions();
  const {
    profile,
    activeAddress,
    history,
    activeRequest,
    activeTrial,
    credits,
    mode,
    setMode,
    addToCart,
    addBundleToCart,
    quantityForService,
  } = useAppContext();

  /**
   * The service kept behind the instant sheet. Held after the sheet closes so
   * its content is still there to animate out.
   */
  const [instantService, setInstantService] = useState<Service | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The auth gate lives in `(tabs)/_layout` so it covers every tab; this screen
  // only has to tolerate the frame before the redirect lands.
  if (!profile) return null;

  const activeBooking = history.find((h) =>
    ['searching', 'in_progress', 'pending_rating'].includes(h.status)
  );

  // Three tiles per row within the 16pt gutter.
  // Tile is (available width − 2 gaps) / 3.  We use space-between rows so
  // the gaps are handled by the layout engine — no gap math needed here.
  const TILE_GAP = 10;
  const tileWidth = (width - spacing.lg * 2 - TILE_GAP * 2) / 3;
  const popular = getPopularServices();

  /**
   * Whether this service goes out for instant dispatch rather than into the cart.
   * Deep cleaning and repairs need machines and a fixed slot, so they keep the
   * scheduled flow whatever the toggle says.
   */
  const dispatchesInstantly = (service: Service) =>
    mode === 'instant' && getGroup(service.group).supportsInstant;

  function openInstantSheet(service: Service) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInstantService(service);
    setSheetOpen(true);
  }

  /**
   * Instant skips the catalogue page entirely: the promise is an expert at the
   * door in ten minutes, and a detail page then a cart then a checkout is three
   * screens too many for that.
   */
  function openService(service: Service) {
    if (dispatchesInstantly(service)) return openInstantSheet(service);
    router.push({ pathname: '/service/[key]', params: { key: service.key } });
  }

  /**
   * The tile's own add button. In instant mode there is no cart to add to — the
   * booking goes straight out — so it opens the same sheet the tile body does.
   * Without this the most obvious "pick this one" control on the grid silently
   * stacks a cart line instead, which is the opposite of what Instant promises.
   */
  function addService(service: Service) {
    if (dispatchesInstantly(service)) return openInstantSheet(service);
    addToCart(service.key);
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
          initial={profile.displayInitial}
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

        <View style={styles.sheet}>
          {/* ── Dispatch mode ───────────────────────────────────────────── */}
          <ModeToggle
            mode={mode}
            onSelect={(m) => setMode(m)}
          />

          {/* ── Live trial ──────────────────────────────────────────────── */}
          {/* Its own strip rather than another branch of the chain below: a trial
              and a normal booking can both be live at once, and an outstanding
              feedback form is the one thing here that somebody else is waiting on. */}
          {activeTrial ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/trial/track/[id]', params: { id: activeTrial.id } })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.liveCard,
                { backgroundColor: colors.heroBackground, opacity: pressed ? 0.92 : 1 },
              ]}
            >
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <View style={styles.flex}>
                <Text variant="bodySemi" tone="onHero" numberOfLines={1}>
                  {activeTrial.feedbackPending
                    ? 'Rate your trial — it onboards a new professional'
                    : activeTrial.payment.payable
                      ? 'Work done — pay for your trial'
                      : activeTrial.status === 'assigned'
                        ? 'Asking a new professional near you'
                        : 'Your new professional is on the way'}
                </Text>
                <Text variant="caption" style={{ color: colors.onHeroMuted }} numberOfLines={1}>
                  Discounted trial · {formatPrice(activeTrial.pricing.userPrice)}
                </Text>
              </View>
              <Text variant="captionSemi" tone="onHero">
                {activeTrial.feedbackPending
                  ? 'Rate'
                  : activeTrial.payment.payable
                    ? 'Pay'
                    : 'Track'}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.heroForeground}
              />
            </Pressable>
          ) : null}

          {/* ── Live booking ────────────────────────────────────────────── */}
          {/* The server's active instant request wins over a local scheduled one:
              it is the thing actually happening right now, and it is the only one
              that can be waiting on a payment. */}
          {activeRequest ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/request/[id]', params: { id: activeRequest.id } })
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
                  {activeRequest.payment.payable
                    ? 'Work done — pay your professional'
                    : activeRequest.status === 'searching'
                      ? 'Finding a professional near you'
                      : 'Your professional is on the way'}
                </Text>
                <Text
                  variant="caption"
                  style={{ color: colors.onHeroMuted }}
                  numberOfLines={1}
                >
                  {activeRequest.subcategoryName
                    ? `${activeRequest.categoryName} · ${activeRequest.subcategoryName}`
                    : activeRequest.categoryName}
                </Text>
              </View>
              <Text variant="captionSemi" tone="onPrimary">
                {activeRequest.payment.payable ? 'Pay' : 'Track'}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.primaryForeground}
              />
            </Pressable>
          ) : activeBooking ? (
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
                instant={dispatchesInstantly(service)}
                onPress={() => openService(service)}
                onAdd={() => addService(service)}
              />
            ))}
          </ScrollView>

          {/* ── Full catalog, by group ──────────────────────────────────── */}
          {SERVICE_GROUPS.map((group) => {
            const services = getServicesByGroup(group.key);
            // Chunk into explicit rows of 3 — avoids flexWrap+gap bugs in RN.
            const rows: Service[][] = [];
            for (let i = 0; i < services.length; i += 3) {
              rows.push(services.slice(i, i + 3));
            }
            return (
              <View key={group.key}>
                <SectionHeader
                  title={group.title}
                  subtitle={group.subtitle}
                  style={styles.sectionTop}
                />
                <View style={styles.grid}>
                  {rows.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.tileRow}>
                      {row.map((service: Service) => (
                        <ServiceTile
                          key={service.key}
                          service={service}
                          width={tileWidth}
                          quantity={quantityForService(service.key)}
                          instant={dispatchesInstantly(service)}
                          onPress={() => openService(service)}
                          onAdd={() => addService(service)}
                        />
                      ))}
                      {/* Pad incomplete last row so tiles stay left-aligned */}
                      {row.length < 3 &&
                        Array.from({ length: 3 - row.length }).map((_, fi) => (
                          <View key={`filler-${fi}`} style={{ width: tileWidth }} />
                        ))}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {/* ── Promises ────────────────────────────────────────────────── */}
          <SectionHeader
            title="The Kaaryo promise"
            subtitle="Why 12 lakh families let us in"
            style={styles.sectionTop}
          />
          <View style={styles.twoColGrid}>
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

      {instantService ? (
        <InstantBookingSheet
          service={instantService}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/**
 * Pill-shaped segmented toggle: Instant ↔ Schedule.
 *
 * An animated thumb slides beneath the active segment so the transition is
 * immediately legible — the user never has to guess which mode is on.
 */
function ModeToggle({
  mode,
  onSelect,
}: {
  mode: 'instant' | 'schedule';
  onSelect: (m: 'instant' | 'schedule') => void;
}) {
  const { colors, shadow } = useTheme();
  // 0 = Instant (left), 1 = Schedule (right)
  const thumbAnim = useRef(new Animated.Value(mode === 'instant' ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(thumbAnim, {
      toValue: mode === 'instant' ? 0 : 1,
      useNativeDriver: false,
      tension: 280,
      friction: 22,
    }).start();
  }, [mode, thumbAnim]);

  const SEGMENTS: { key: 'instant' | 'schedule'; label: string; icon: 'lightning-bolt' | 'calendar-clock'; sub: string }[] = [
    { key: 'instant', label: 'Instant', icon: 'lightning-bolt', sub: 'Get help now' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar-clock', sub: 'Pick your time' },
  ];

  return (
    <View
      style={[
        styles.toggleTrack,
        { backgroundColor: colors.muted, borderColor: colors.border },
        shadow.sm,
      ]}
      accessibilityRole="radiogroup"
    >
      {/* Sliding active thumb */}
      <Animated.View
        style={[
          styles.toggleThumb,
          {
            backgroundColor: colors.primary,
            left: thumbAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['2%', '51%'],
            }),
          },
          shadow.md,
        ]}
      />

      {SEGMENTS.map((seg) => {
        const isActive = mode === seg.key;
        return (
          <Pressable
            key={seg.key}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(seg.key);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            style={styles.toggleSegment}
          >
            <View style={styles.toggleSegmentInner}>
              <View
                style={[
                  styles.toggleIconBubble,
                  {
                    backgroundColor: isActive
                      ? colors.onHeroSurface
                      : colors.secondary,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={seg.icon}
                  size={18}
                  color={
                    isActive ? colors.primaryForeground : colors.secondaryForeground
                  }
                />
              </View>
              <View>
                <Text
                  variant="bodySemi"
                  tone={isActive ? 'onPrimary' : 'default'}
                >
                  {seg.label}
                </Text>
                <Text
                  variant="caption"
                  style={{
                    color: isActive
                      ? colors.onHeroMuted
                      : colors.mutedForeground,
                  }}
                >
                  {seg.sub}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
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
  // Body content, starting straight under the hero's rounded bottom edge.
  sheet: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  // ── ModeToggle ──────────────────────────────────────────────────────────────
  toggleTrack: {
    flexDirection: 'row',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  toggleThumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '48%',
    borderRadius: radii.lg,
  },
  toggleSegment: {
    flex: 1,
    zIndex: 1,
  },
  toggleSegmentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  toggleIconBubble: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
  grid: { flexDirection: 'column', gap: 10 },
  tileRow: { flexDirection: 'row', justifyContent: 'space-between' },
  twoColGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
