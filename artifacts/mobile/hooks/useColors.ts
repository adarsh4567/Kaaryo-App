import { useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import colors, { type Palette } from '@/constants/colors';
import { elevation, radii, spacing, type } from '@/constants/theme';

// ─── Module-level override store (with React subscriptions) ──────────────────
//
// We keep the override as a plain module variable so AppContext can write to it
// without a circular import. The key addition is a subscriber set: every call
// to `useThemeOverride()` registers a setState updater, so when AppContext calls
// `setThemeOverride(...)` all mounted consumers re-render immediately.

type ThemeOverride = 'light' | 'dark' | null;

let _override: ThemeOverride = null;
const _listeners = new Set<(next: ThemeOverride) => void>();

/** Called by AppContext after hydration and every toggle. */
export function setThemeOverride(next: ThemeOverride) {
  _override = next;
  _listeners.forEach((fn) => fn(next));
}

/** Read the current override synchronously (for initial state). */
export function getThemeOverride(): ThemeOverride {
  return _override;
}

/**
 * Subscribes a component to theme-override changes.
 * Returns the current override and re-renders the component whenever it changes.
 */
function useThemeOverride(): ThemeOverride {
  const [override, setOverride] = useState<ThemeOverride>(_override);

  useEffect(() => {
    // Sync immediately in case setThemeOverride was called between render and
    // this effect running (e.g. during hydration).
    setOverride(_override);

    const handler = (next: ThemeOverride) => setOverride(next);
    _listeners.add(handler);
    return () => {
      _listeners.delete(handler);
    };
  }, []);

  return override;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the colour tokens for the active scheme, plus `radius`.
 *
 * Prefer `useTheme()` in new code — it adds spacing, radii, the type scale and
 * scheme-aware elevation. This hook stays for components that only need colour.
 */
export function useColors(): Palette & { radius: number } {
  const scheme = useColorScheme();
  const override = useThemeOverride();
  const isDark = override != null ? override === 'dark' : scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
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
  const override = useThemeOverride();
  const isDark = override != null ? override === 'dark' : scheme === 'dark';

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
