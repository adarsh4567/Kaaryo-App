import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import colors, { type Palette } from '@/constants/colors';
import { elevation, radii, spacing, type } from '@/constants/theme';

/**
 * Returns the colour tokens for the active scheme, plus `radius`.
 *
 * Prefer `useTheme()` in new code — it adds spacing, radii, the type scale and
 * scheme-aware elevation. This hook stays for components that only need colour.
 */
export function useColors(): Palette & { radius: number } {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}

/**
 * The full design system for the active scheme.
 *
 * `isDark` is exposed because a few components need it directly (blur tint,
 * status-bar style, image overlays) rather than through a colour token.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return useMemo(() => {
    const palette = isDark ? colors.dark : colors.light;
    return {
      colors: palette,
      isDark,
      spacing,
      radii,
      type,
      radius: colors.radius,
      shadow: elevation(palette.shadow, isDark),
    };
  }, [isDark]);
}

export type Theme = ReturnType<typeof useTheme>;
