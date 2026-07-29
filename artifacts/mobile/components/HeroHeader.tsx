import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii, spacing } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import type { MdiName } from '@/lib/catalog';

/**
 * The dark-green app header used on the home screen.
 *
 * Carries the three things a 10-minute service app has to answer immediately:
 * how fast (the ETA badge), where (the address selector) and who (the avatar).
 * Renders its own top inset so it can bleed under the status bar.
 */
export function HeroHeader({
  topInset,
  eta,
  locality,
  addressLine,
  initial,
  credits,
  onPressLocation,
  onPressProfile,
  onPressCredits,
  children,
}: {
  topInset: number;
  /** Minutes until an expert can arrive. */
  eta: number;
  locality: string;
  addressLine: string;
  /** First letter of the user's name, shown in the avatar. */
  initial: string;
  /** Wallet credit in rupees; the chip is hidden when zero. */
  credits: number;
  onPressLocation: () => void;
  onPressProfile: () => void;
  onPressCredits: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <LinearGradient
      colors={[colors.heroBackground, colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: topInset + spacing.md }]}
    >
      <View style={styles.row}>
        {/* ETA badge — the product's whole promise in one block. */}
        <View style={[styles.etaBadge, { backgroundColor: colors.heroForeground }]}>
          <Text variant="h2" style={{ color: colors.primary }}>
            {eta}
          </Text>
          <Text variant="micro" style={{ color: colors.primary }}>
            MINS
          </Text>
        </View>

        <Pressable
          onPress={onPressLocation}
          accessibilityRole="button"
          accessibilityLabel={`Change address. Current address ${locality}`}
          style={({ pressed }) => [styles.location, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.localityRow}>
            <Text variant="h3" tone="onHero" numberOfLines={1}>
              {locality}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={18}
              color={colors.heroForeground}
            />
          </View>
          <Text variant="caption" tone="onHeroMuted" numberOfLines={1}>
            {addressLine}
          </Text>
        </Pressable>

        {credits > 0 ? (
          <HeroAction
            icon="gift-outline"
            label={`₹${credits}`}
            onPress={onPressCredits}
            accessibilityLabel={`Rewards, ₹${credits} available`}
          />
        ) : null}

        <Pressable
          onPress={onPressProfile}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={({ pressed }) => [
            styles.avatar,
            {
              backgroundColor: colors.onHeroSurface,
              borderColor: colors.onHeroBorder,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="bodySemi" tone="onHero">
            {initial}
          </Text>
        </Pressable>
      </View>

      {children}
    </LinearGradient>
  );
}

/** Pill action for the hero row — icon plus an optional value label. */
function HeroAction({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: MdiName;
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.heroAction,
        {
          backgroundColor: colors.onHeroSurface,
          borderColor: colors.onHeroBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={15} color={colors.heroForeground} />
      {label ? (
        <Text variant="captionSemi" tone="onHero">
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Search entry point that sits at the bottom of the hero, half-overlapping the
 * content below it. Navigates rather than accepting input inline.
 */
export function HeroSearchBar({ onPress, placeholder }: { onPress: () => void; placeholder: string }) {
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [
        styles.search,
        shadow.md,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={19} color={colors.mutedForeground} />
      <Text variant="body" tone="muted" numberOfLines={1} style={styles.flex}>
        {placeholder}
      </Text>
      <View style={[styles.searchDivider, { backgroundColor: colors.border }]} />
      <MaterialCommunityIcons name="microphone-outline" size={18} color={colors.primary} />
    </Pressable>
  );
}

/**
 * Compact stack header for pushed screens: back button, title, optional action.
 */
export function ScreenHeader({
  title,
  subtitle,
  topInset,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  topInset: number;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.screenHeader,
        {
          paddingTop: topInset + spacing.sm,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={({ pressed }) => [
          styles.backBtn,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <View style={styles.flex}>
        <Text variant="h3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  etaBadge: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  location: { flex: 1 },
  localityRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchDivider: { width: StyleSheet.hairlineWidth, height: 20 },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
