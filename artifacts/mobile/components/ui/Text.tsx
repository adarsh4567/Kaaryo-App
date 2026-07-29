import React from 'react';
import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/hooks/useColors';
import { type } from '@/constants/theme';

export type TextVariant = keyof typeof type;

/**
 * Which palette entry the text colour comes from. `default` is body foreground,
 * `muted` is secondary text, `onHero`/`onHeroMuted` are for the green hero and
 * `onPrimary` for text sitting on a filled brand button.
 */
export type TextTone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'onPrimary'
  | 'onHero'
  | 'onHeroMuted';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Centres the text without needing a wrapping style array at the call site. */
  center?: boolean;
}

/**
 * The only text primitive screens should use.
 *
 * Wires the Inter family and the type scale from `constants/theme` so no screen
 * has to remember font-family strings or line heights.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  center,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  const toneColor: Record<TextTone, string> = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    destructive: colors.destructive,
    onPrimary: colors.primaryForeground,
    onHero: colors.heroForeground,
    onHeroMuted: colors.onHeroMuted,
  };

  return (
    <RNText
      style={[
        type[variant],
        { color: toneColor[tone] },
        center && styles.center,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
