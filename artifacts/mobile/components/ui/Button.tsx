import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii } from '@/constants/theme';
import { Text } from './Text';
import type { MdiName } from '@/lib/catalog';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  /** White pill for use on top of the green hero. */
  | 'onHero';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: MdiName;
  /** Renders the icon after the label instead of before it. */
  iconRight?: MdiName;
  loading?: boolean;
  /** Stretches to the container width — the default for primary CTAs. */
  fullWidth?: boolean;
  /** Fires light impact feedback on press; off for destructive actions. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ButtonSize, { padV: number; padH: number; icon: number; gap: number }> = {
  sm: { padV: 8, padH: 14, icon: 16, gap: 6 },
  md: { padV: 13, padH: 18, icon: 18, gap: 8 },
  lg: { padV: 16, padH: 22, icon: 20, gap: 10 },
};

/**
 * The app's only button. Every variant keeps the same 14pt radius so buttons
 * line up with cards and inputs.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, shadow } = useTheme();
  const dims = SIZES[size];
  const isDisabled = disabled || loading;

  const skin: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
    outline: { bg: 'transparent', fg: colors.foreground, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary },
    destructive: { bg: 'transparent', fg: colors.destructive, border: colors.destructive },
    onHero: { bg: colors.heroForeground, fg: colors.primary },
  };
  const { bg, fg, border } = skin[variant];

  function handlePress(event: Parameters<NonNullable<PressableProps['onPress']>>[0]) {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(event);
  }

  const textVariant = size === 'sm' ? 'captionSemi' : size === 'lg' ? 'h3' : 'bodySemi';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border ?? 'transparent',
          borderWidth: border ? 1.5 : 0,
          paddingVertical: dims.padV,
          paddingHorizontal: dims.padH,
          gap: dims.gap,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        variant === 'primary' && shadow.sm,
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={dims.icon} color={fg} /> : null}
          <Text variant={textVariant} style={{ color: fg }} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? (
            <MaterialCommunityIcons name={iconRight} size={dims.icon} color={fg} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Square icon-only button — used for back arrows and header actions. */
export function IconButton({
  icon,
  onPress,
  size = 40,
  tone = 'surface',
  accessibilityLabel,
  style,
}: {
  icon: MdiName;
  onPress?: () => void;
  size?: number;
  tone?: 'surface' | 'hero' | 'plain';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const bg =
    tone === 'hero' ? colors.onHeroSurface : tone === 'plain' ? 'transparent' : colors.card;
  const fg = tone === 'hero' ? colors.heroForeground : colors.foreground;
  const borderColor =
    tone === 'hero' ? colors.onHeroBorder : tone === 'plain' ? 'transparent' : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          backgroundColor: bg,
          borderWidth: tone === 'plain' ? 0 : 1,
          borderColor,
          opacity: pressed ? 0.7 : 1,
        },
        styles.center,
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.5} color={fg} />
    </Pressable>
  );
}

/**
 * Sticky bottom action bar. Sits above the safe-area inset and separates itself
 * from scrolling content with a hairline and the card surface.
 */
export function BottomBar({
  children,
  bottomInset,
}: {
  children: React.ReactNode;
  bottomInset: number;
}) {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={[
        styles.bottomBar,
        shadow.lg,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: bottomInset + 14,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
