/**
 * Non-colour design primitives: spacing, radii, type scale, elevation.
 *
 * Colours live in `constants/colors.ts`. Everything here is scheme-independent
 * except `elevation`, which needs the palette's shadow colour — see
 * `useTheme()` in `hooks/useColors.ts` for the scheme-aware version.
 */

/** 4pt grid. Screen gutter is `spacing.lg` (16) everywhere. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

/** Corner radii. `md` (14) is the brand default; `pill` for chips and toggles. */
export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 28,
  pill: 999,
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Type scale. Display sizes carry negative tracking so large headings stay
 * tight; small caps labels get positive tracking for legibility.
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  bodySemi: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  captionSemi: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  micro: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
} as const;

export type ElevationLevel = 'none' | 'sm' | 'md' | 'lg';

/**
 * Elevation presets. Shadows are intentionally soft and neutral-dark; in dark
 * mode they mostly disappear, so cards there rely on `card` vs `background`
 * contrast plus a hairline border.
 */
export function elevation(shadowColor: string, isDark: boolean) {
  if (isDark) {
    return {
      none: {},
      sm: {},
      md: {},
      lg: {},
    } satisfies Record<ElevationLevel, object>;
  }
  return {
    none: {},
    sm: {
      shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    lg: {
      shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
  } satisfies Record<ElevationLevel, object>;
}

/** Height of the floating tab bar, excluding the bottom safe-area inset. */
export const TAB_BAR_HEIGHT = 64;
