/**
 * Kaaryo design tokens — professional, earthy-green SaaS.
 *
 * Brand: deep forest green (#00674F light / #3EBB9E dark).
 * Backgrounds sit on a very light slate (light) / near-black zinc (dark) ramp.
 * Semantic greens (`secondary`, `success*`) share the #E2F9F1 / #112A22 tint so
 * "subtle green surface" always reads the same way across the app.
 *
 * Source of truth for every colour in the app — screens must never hardcode hex.
 */

const colors = {
  light: {
    // Core surfaces
    background: '#F8FAFC',
    foreground: '#0F172A',
    text: '#0F172A',
    card: '#FFFFFF',
    cardForeground: '#0F172A',

    // Brand
    tint: '#00674F',
    primary: '#00674F',
    primaryForeground: '#FFFFFF',
    /** Slightly lifted brand green for gradients and pressed hero states. */
    primaryLight: '#0A8265',
    /** Darkest brand green — hero sections, immersive headers. */
    heroBackground: '#0A3C30',
    heroForeground: '#FFFFFF',

    // Subtle green tint surfaces
    secondary: '#E2F9F1',
    secondaryForeground: '#00674F',

    // Neutral / muted
    muted: '#F1F5F9',
    mutedForeground: '#64748B',
    accent: '#F1F5F9',
    accentForeground: '#0F172A',

    // Lines
    border: '#E2E8F0',
    input: '#E2E8F0',

    // Semantic
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    destructiveLight: '#FEE2E2',
    success: '#3EBB9E',
    successForeground: '#FFFFFF',
    successLight: '#E2F9F1',
    warning: '#F59E0B',
    warningForeground: '#FFFFFF',
    warningLight: '#FEF3C7',

    // Utility
    /** Scrim behind sheets and above imagery. */
    overlay: 'rgba(15, 23, 42, 0.45)',
    /** Translucent surfaces for chips sitting on the hero. */
    onHeroSurface: 'rgba(255, 255, 255, 0.14)',
    onHeroBorder: 'rgba(255, 255, 255, 0.22)',
    onHeroMuted: 'rgba(255, 255, 255, 0.72)',
    /** Faux-map canvas used by the locate and tracking views. */
    mapCanvas: '#EEF3F0',
    mapRoad: '#FFFFFF',
    mapBlock: '#E3EAE6',
    star: '#F59E0B',
    shadow: '#0F172A',
  },

  dark: {
    // Core surfaces
    background: '#09090B',
    foreground: '#FAFAFA',
    text: '#FAFAFA',
    card: '#18181B',
    cardForeground: '#FAFAFA',

    // Brand
    tint: '#3EBB9E',
    primary: '#3EBB9E',
    primaryForeground: '#09090B',
    primaryLight: '#5ED0B6',
    heroBackground: '#131F1C',
    heroForeground: '#FAFAFA',

    // Subtle green tint surfaces
    secondary: '#112A22',
    secondaryForeground: '#73E6CB',

    // Neutral / muted
    muted: '#27272A',
    mutedForeground: '#A1A1AA',
    accent: '#27272A',
    accentForeground: '#FAFAFA',

    // Lines
    border: '#27272A',
    input: '#27272A',

    // Semantic
    destructive: '#DC2626',
    destructiveForeground: '#FAFAFA',
    destructiveLight: '#3A1414',
    success: '#3EBB9E',
    successForeground: '#09090B',
    successLight: '#112A22',
    warning: '#F59E0B',
    warningForeground: '#09090B',
    warningLight: '#3D2E0A',

    // Utility
    overlay: 'rgba(0, 0, 0, 0.6)',
    onHeroSurface: 'rgba(255, 255, 255, 0.10)',
    onHeroBorder: 'rgba(255, 255, 255, 0.16)',
    onHeroMuted: 'rgba(250, 250, 250, 0.66)',
    mapCanvas: '#141618',
    mapRoad: '#27272A',
    mapBlock: '#1D1F21',
    star: '#F59E0B',
    shadow: '#000000',
  },

  /** Default corner radius for cards and buttons. */
  radius: 14,
};

export type Palette = typeof colors.light;

export default colors;
