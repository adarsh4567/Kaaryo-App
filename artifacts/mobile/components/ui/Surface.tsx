import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii, spacing, type ElevationLevel } from '@/constants/theme';
import { Text } from './Text';
import type { MdiName } from '@/lib/catalog';

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface CardProps {
  children: React.ReactNode;
  /** `card` is the default white/zinc surface; `tint` is the subtle green. */
  tone?: 'card' | 'tint' | 'muted' | 'hero' | 'warning' | 'destructive';
  padding?: keyof typeof spacing | 'none';
  radius?: keyof typeof radii;
  elevation?: ElevationLevel;
  bordered?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The standard content surface. Cards default to a hairline border plus a soft
 * shadow in light mode; in dark mode the shadow drops out and the border does
 * the separating (see `elevation()` in constants/theme).
 */
export function Card({
  children,
  tone = 'card',
  padding = 'lg',
  radius = 'lg',
  elevation = 'sm',
  bordered = true,
  onPress,
  style,
}: CardProps) {
  const { colors, shadow } = useTheme();

  const tones = {
    card: { bg: colors.card, border: colors.border },
    tint: { bg: colors.secondary, border: 'transparent' },
    muted: { bg: colors.muted, border: 'transparent' },
    hero: { bg: colors.heroBackground, border: 'transparent' },
    warning: { bg: colors.warningLight, border: 'transparent' },
    destructive: { bg: colors.destructiveLight, border: 'transparent' },
  } as const;
  const skin = tones[tone];

  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: skin.bg,
      borderRadius: radii[radius],
      padding: padding === 'none' ? 0 : spacing[padding],
      borderWidth: bordered && skin.border !== 'transparent' ? StyleSheet.hairlineWidth : 0,
      borderColor: skin.border,
    },
    tone === 'card' && shadow[elevation],
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export type BadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'neutral'
  | 'onHero';

export function Badge({
  label,
  tone = 'primary',
  icon,
  style,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: MdiName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    primary: { bg: colors.secondary, fg: colors.secondaryForeground },
    success: { bg: colors.successLight, fg: colors.success },
    warning: { bg: colors.warningLight, fg: colors.warning },
    destructive: { bg: colors.destructiveLight, fg: colors.destructive },
    neutral: { bg: colors.muted, fg: colors.mutedForeground },
    onHero: { bg: colors.onHeroSurface, fg: colors.heroForeground },
  };
  const skin = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor: skin.bg }, style]}>
      {icon ? <MaterialCommunityIcons name={icon} size={12} color={skin.fg} /> : null}
      <Text variant="micro" style={{ color: skin.fg }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── IconBubble ───────────────────────────────────────────────────────────────

/**
 * Tinted rounded-square that holds a service or feature icon. This is the app's
 * substitute for photography — one shape, one tint, consistent everywhere.
 */
export function IconBubble({
  icon,
  size = 52,
  tone = 'tint',
  style,
}: {
  icon: MdiName;
  size?: number;
  tone?: 'tint' | 'muted' | 'primary' | 'hero' | 'warning';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const tones = {
    tint: { bg: colors.secondary, fg: colors.secondaryForeground },
    muted: { bg: colors.muted, fg: colors.mutedForeground },
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    hero: { bg: colors.onHeroSurface, fg: colors.heroForeground },
    warning: { bg: colors.warningLight, fg: colors.warning },
  } as const;
  const skin = tones[tone];

  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: skin.bg,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.52} color={skin.fg} />
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.flex}>
        <Text variant="h2">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" style={styles.sectionSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.sectionAction, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="captionSemi" tone="primary">
            {actionLabel}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ spacingY = spacing.lg }: { spacingY?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacingY,
      }}
    />
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: MdiName;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <IconBubble icon={icon} size={72} />
      <Text variant="h2" center style={styles.emptyTitle}>
        {title}
      </Text>
      <Text variant="body" tone="muted" center style={styles.emptyMessage}>
        {message}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.xs,
    alignSelf: 'flex-start',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionSub: { marginTop: 3 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  empty: { alignItems: 'center', paddingTop: spacing['4xl'], paddingHorizontal: spacing.xl },
  emptyTitle: { marginTop: spacing.lg },
  emptyMessage: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
