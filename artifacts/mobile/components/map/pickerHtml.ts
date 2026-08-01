import { mapDocument } from './mapShell';

/**
 * The address picker's Leaflet document: one pin the customer places by
 * dragging it, tapping the map, or panning under a fixed crosshair.
 *
 * Why let them adjust it at all: the saved `lat`/`lng` is what dispatch
 * searches around and what the tracking map later renders as the destination.
 * A raw GPS fix is whatever the phone believed at the moment they tapped
 * "use my location" — often the road outside, sometimes the wrong building, and
 * frequently nowhere near the address when they are saving it from work.
 */

export interface PickerHtmlOptions {
  tileUrl: string;
  attribution: string;
  /** Initial pin position, `[lat, lng]`. */
  center: [number, number];
  colors: { primary: string; surface: string };
  /** Tighter than the tracking map — this is a building-level choice. */
  zoom?: number;
}

export function pickerHtml(options: PickerHtmlOptions): string {
  return mapDocument({
    tileUrl: options.tileUrl,
    attribution: options.attribution,
    surface: options.colors.surface,
    center: options.center,
    zoom: options.zoom ?? 16,
    config: { colors: options.colors },
    css: `
  .pin {
    width: 24px; height: 24px; border-radius: 12px 12px 12px 2px;
    transform: rotate(-45deg);
    border: 3px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
  }`,
    script: `
function pinIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="pin" style="background:' + CONFIG.colors.primary + '"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

var pin = L.marker(CONFIG.center, { icon: pinIcon(), draggable: true, autoPan: true }).addTo(map);

function publish(latlng) {
  post({ type: 'pick', lat: latlng.lat, lng: latlng.lng });
}

pin.on('dragend', function () { publish(pin.getLatLng()); });

// Tapping anywhere is faster than dragging the pin across the screen, and is
// what people reach for first on a small map.
map.on('click', function (e) {
  pin.setLatLng(e.latlng);
  publish(e.latlng);
});

/** Moves the pin without echoing a 'pick' back — for GPS/city changes from RN. */
window.setPin = function (lat, lng, recenter) {
  var next = L.latLng(lat, lng);
  pin.setLatLng(next);
  if (recenter) map.setView(next, Math.max(map.getZoom(), 16));
};`,
  });
}
