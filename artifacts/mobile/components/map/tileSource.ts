/**
 * Where the app's OpenStreetMap tiles come from.
 *
 * `EXPO_PUBLIC_*` is inlined at bundle time, so these are build-time constants —
 * changing `.env` needs a bundler restart, not just a reload (same as
 * `EXPO_PUBLIC_API_URL`, see `lib/api.ts`).
 *
 * The fallbacks below are CARTO's free basemaps, which exist so the map works
 * on a fresh checkout with no key configured. They are **not** a production
 * tile source — set `EXPO_PUBLIC_OSM_TILE_URL` to a provisioned provider
 * (MapTiler / Geoapify / Stadia / self-hosted) before shipping. Never point
 * either at `tile.openstreetmap.org`: the OSMF's tile usage policy forbids
 * third-party app traffic and they block offending clients without warning.
 */

const FALLBACK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const FALLBACK_TILE_URL_DARK = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}{r}.png';
const FALLBACK_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

export interface TileSource {
  tileUrl: string;
  /** Required by the ODbL licence — keep Leaflet's attribution control visible. */
  attribution: string;
}

export function resolveTileSource(isDark: boolean): TileSource {
  const tileUrl =
    (isDark ? process.env.EXPO_PUBLIC_OSM_TILE_URL_DARK : process.env.EXPO_PUBLIC_OSM_TILE_URL) ||
    (isDark ? FALLBACK_TILE_URL_DARK : FALLBACK_TILE_URL);

  return {
    tileUrl,
    attribution: process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || FALLBACK_ATTRIBUTION,
  };
}
