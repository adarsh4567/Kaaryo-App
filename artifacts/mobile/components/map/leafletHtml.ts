import { mapDocument } from './mapShell';

/**
 * The tracking map's Leaflet document: a fixed home marker at the job address
 * and a live worker marker that glides toward it.
 *
 * The shared shell (`mapShell.ts`) supplies Leaflet itself, the tile layer and
 * the `post()` bridge; everything here is the tracking-specific half.
 */

export interface LeafletHtmlOptions {
  tileUrl: string;
  attribution: string;
  /** Job address, `[lat, lng]` — already swapped from GeoJSON order by the caller. */
  destination: [number, number];
  colors: {
    primary: string;
    onPrimary: string;
    surface: string;
    mutedForeground: string;
    arrived: string;
  };
  dark: boolean;
}

export function leafletHtml(options: LeafletHtmlOptions): string {
  return mapDocument({
    tileUrl: options.tileUrl,
    attribution: options.attribution,
    surface: options.colors.surface,
    center: options.destination,
    zoom: 14,
    config: { destination: options.destination, colors: options.colors, dark: options.dark },
    css: `
  .worker-dot {
    width: 18px; height: 18px; border-radius: 9px; border: 3px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,.35);
    animation: pulse 1.8s ease-out infinite;
  }
  .worker-arrow {
    width: 0; height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 18px solid;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
    transform-origin: 50% 65%;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(0,0,0,.28); }
    70%  { box-shadow: 0 0 0 10px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }`,
    script: `
function homeIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:26px;height:26px;border-radius:13px;background:' + CONFIG.colors.primary +
      ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// A stale fix is greyed rather than hidden — a confident dot where the worker
// was two minutes ago is worse than an obviously uncertain one.
function workerIcon(heading, arrived, stale) {
  var color = stale ? CONFIG.colors.mutedForeground : arrived ? CONFIG.colors.arrived : CONFIG.colors.primary;
  var opacity = stale ? 0.55 : 1;
  if (heading === null || heading === undefined) {
    return L.divIcon({
      className: '',
      html: '<div class="worker-dot" style="background:' + color + ';opacity:' + opacity + '"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
  return L.divIcon({
    className: '',
    html: '<div class="worker-arrow" style="border-bottom-color:' + color + ';opacity:' + opacity +
      ';transform:rotate(' + heading + 'deg)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 15],
  });
}

var homeMarker = L.marker(CONFIG.destination, { icon: homeIcon(), interactive: false }).addTo(map);
var workerMarker = null;
var animFrame = null;
var userInteracted = false;

map.on('dragstart zoomstart', function () { userInteracted = true; });

function fitBoth() {
  if (!workerMarker) return;
  var bounds = L.latLngBounds([homeMarker.getLatLng(), workerMarker.getLatLng()]);
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
}

// Animates between successive pings rather than snapping — pings land every
// 4-10s, and a marker that jumps instead of glides reads as broken, not live.
window.setWorker = function (lat, lng, heading, arrived, stale) {
  var next = L.latLng(lat, lng);

  if (!workerMarker) {
    workerMarker = L.marker(next, { icon: workerIcon(heading, arrived, stale), interactive: false }).addTo(map);
    fitBoth();
    return;
  }

  workerMarker.setIcon(workerIcon(heading, arrived, stale));
  if (animFrame) cancelAnimationFrame(animFrame);

  var from = workerMarker.getLatLng();
  var start = null;
  var DURATION = 1200;

  function step(ts) {
    if (start === null) start = ts;
    var t = Math.min(1, (ts - start) / DURATION);
    var eased = t * (2 - t);
    workerMarker.setLatLng([
      from.lat + (next.lat - from.lat) * eased,
      from.lng + (next.lng - from.lng) * eased,
    ]);
    if (t < 1) animFrame = requestAnimationFrame(step);
  }
  animFrame = requestAnimationFrame(step);

  // Re-fit only if the marker actually left the viewport and the customer
  // hasn't taken over the camera — auto-recentring on every ping fights a
  // deliberate pan, which is the #1 complaint about tracking maps.
  if (!userInteracted && !map.getBounds().contains(next)) fitBoth();
};

window.recenter = function () {
  userInteracted = false;
  fitBoth();
};`,
  });
}
