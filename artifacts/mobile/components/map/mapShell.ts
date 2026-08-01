/**
 * The common half of every Leaflet document the app embeds in a WebView.
 *
 * The tracking map and the address picker need different markers and different
 * exposed functions, but the parts that are easy to get subtly wrong — the
 * pinned Leaflet version and its Subresource Integrity hashes, the tile layer's
 * `tileok`/`tileerror` contract with the RN side, and the OSM attribution that
 * the ODbL licence requires stay visible — are identical and live here once.
 * Two copies of that is two places for it to drift.
 */

export interface MapDocumentOptions {
  tileUrl: string;
  attribution: string;
  /** Page background behind the tiles, from the palette. */
  surface: string;
  /** Initial centre, `[lat, lng]` — Leaflet order, already swapped from GeoJSON. */
  center: [number, number];
  zoom: number;
  /**
   * Values handed to `script` as the `CONFIG` global. Serialised with
   * `JSON.stringify`, never spliced into the document as raw text — these carry
   * server data (addresses, labels) into an HTML document, so treat them as
   * any other injection point.
   */
  config?: Record<string, unknown>;
  /** Appended to the base stylesheet. */
  css?: string;
  /** Runs once `L`, `map`, `post()` and `CONFIG` all exist. */
  script: string;
}

export function mapDocument({
  tileUrl,
  attribution,
  surface,
  center,
  zoom,
  config = {},
  css = '',
  script,
}: MapDocumentOptions): string {
  const payload = JSON.stringify({ ...config, tileUrl, attribution, center, zoom });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${surface}; }
  .leaflet-control-attribution { font-size: 9px; }
${css}
</style>
</head>
<body>
<div id="map"></div>
<script>
var CONFIG = ${payload};

function post(data) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
}

var map = L.map('map', { zoomControl: false, attributionControl: true });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.setView(CONFIG.center, CONFIG.zoom);

// 'tileok' fires once, the first time any tile loads. It is what lets the RN
// side tell "this tile source is broken" apart from "one tile 404'd at the edge
// of coverage" — the latter is normal while panning and must not tear the whole
// map down to the placeholder backdrop.
var tileOkPosted = false;
L.tileLayer(CONFIG.tileUrl, { attribution: CONFIG.attribution, maxZoom: 19 })
  .on('tileload', function () {
    if (tileOkPosted) return;
    tileOkPosted = true;
    post({ type: 'tileok' });
  })
  .on('tileerror', function () { post({ type: 'tileerror' }); })
  .addTo(map);

${script}

post({ type: 'ready' });
</script>
</body>
</html>`;
}
