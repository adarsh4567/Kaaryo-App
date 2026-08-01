# Live worker tracking with OpenStreetMap — implementation plan

Goal: on the booking detail screen (reached from the "Track booking" button or the
card itself in the Bookings tab), replace the stylised `MapBackdrop` with a real
OpenStreetMap map showing the assigned professional's live position moving toward
the customer's address, and automatically flip the visible status to
**"Arriving soon"** → **"Arrived"** as they get close.

Primary target: [`artifacts/mobile/app/request/[id].tsx`](../artifacts/mobile/app/request/%5Bid%5D.tsx)
— the detail screen for on-demand bookings (`/api/user/service-requests/*`),
because that flow already models an `AssignedWorker` with a (currently static)
`location` field. The same pattern ports almost unchanged to
[`app/tracking/[id].tsx`](../artifacts/mobile/app/tracking/%5Bid%5D.tsx) (legacy
scheduled) and [`app/trial/track/[id].tsx`](../artifacts/mobile/app/trial/track/%5Bid%5D.tsx)
(trials) — do that **after** the primary flow works, not in parallel.

This supersedes `live-tracking-mapbox-plan.md`. The backend contract (§1, §2) is
~90% identical between the two; only the map renderer, the tile source, and the
routing/ETA provider differ.

---

## 0. Prerequisite decisions (read these first)

### 0.1 OpenStreetMap is data, not an SDK

Mapbox/Google ship one SDK that bundles rendering + tiles + routing + geocoding.
OSM is a *dataset*. You assemble three separate things:

| Concern | What you need | Recommended choice |
|---|---|---|
| Rendering | A JS/native map library | **Leaflet** inside `react-native-webview` |
| Tiles (the images) | A tile server | A hosted provider key (MapTiler / Geoapify / Stadia) or self-hosted |
| Routing + ETA | A routing engine | **OSRM** (self-hosted) or OpenRouteService |

### 0.2 Renderer: Leaflet in a WebView (recommended)

Render the map as a Leaflet map inside `react-native-webview`, not as a native
module.

Why this over `react-native-maps` + OSM `UrlTile`:

- **`react-native-webview` runs inside Expo Go.** The team's current workflow
  (`.replit`, `EXPO_PACKAGER_PROXY_URL`, QR-into-Expo-Go) keeps working with no
  `expo prebuild` and no EAS dev-client build. This was the single biggest cost
  in the Mapbox plan; OSM-via-WebView deletes it entirely.
- **iOS/Android only, by design.** `artifacts/mobile` also targets
  `react-native-web` (there's a `web` block in `app.json`), but
  `react-native-webview` ships no web renderer at all — on web it renders
  "does not support this platform" instead of a map. `MapBackdrop` stays as
  the fallback if this screen is ever opened in a browser. Making the tracking
  screen work on web too (e.g. a `LiveTrackingMap.web.tsx` rendering a
  same-origin `<iframe srcDoc>` instead of a `WebView`) is a small, separate
  follow-on — not undertaken here since the mobile app is what matters.
- **`react-native-maps` on iOS still renders Apple Maps underneath.** You can
  overlay OSM raster tiles on it, but you're paying for a native module and still
  fighting the base map. Not worth it here.

Cost of the WebView approach: marker updates cross the RN↔WebView bridge, so
you interpolate movement inside the WebView (§3.4) rather than animating from RN.
That's ~30 lines of JS, and it's covered below.

### 0.3 Tiles: **do not point production at `tile.openstreetmap.org`**

The OSMF public tile server is explicitly not for third-party apps. Its
[Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) forbids
heavy or commercial use, requires an identifying `User-Agent`/`Referer`, and the
OSMF will block offending clients without warning. A consumer booking app polling
a map screen is exactly the traffic they block.

Pick one before writing code:

| Option | Free tier | Notes |
|---|---|---|
| **MapTiler** | 100k tile req/mo | Raster + vector, has dark styles. Good default. |
| **Geoapify** | 3k req/day | Raster OSM, simple keying. |
| **Stadia Maps** | 200k req/mo | Also hosts the Alidade Smooth Dark style. |
| **Thunderforest** | 150k tiles/mo | Nice `transport` style. |
| **OpenFreeMap** | unlimited, no key | Vector-only, community funded, no SLA. |
| **Self-hosted** | — | `openstreetmap-tile-server` / `tileserver-gl` on your own box. Cheapest at scale, most ops work. |

Recommendation: start on **MapTiler** raster tiles for speed, keep the tile URL
in config (§2.7) so switching to self-hosted later is one env var.

**Attribution is a legal requirement, not a nicety.** OSM data is ODbL-licensed:
the string `© OpenStreetMap contributors` (plus the tile provider's own
attribution) must be visible on the map. Leaflet's default attribution control
handles this — don't hide it.

### 0.4 Routing/ETA: OSRM, called from the backend only

`router.project-osrm.org` is a demo server with the same "not for production"
caveat as the tile server. Options:

- **Self-hosted OSRM** — Docker, one India (or state-level) `.osm.pbf` extract
  from Geofabrik, `osrm-extract`/`osrm-partition`/`osrm-customize`. ~8–16 GB RAM
  for a country-sized extract with the MLD pipeline. Best ETA quality, zero
  per-request cost, fully under your control. **Recommended.**
- **OpenRouteService** — hosted, free tier ~2000 req/day. Fine to start.
- **GraphHopper / Valhalla** — equivalent alternatives.

The app **never** calls the routing engine directly. The backend calls it, caches
it, and hands the client a duration + a polyline (§2.4).

### 0.5 Arrival logic lives on the **backend**, not in the app

Distance, ETA and the arrival threshold are server-computed, matching every other
server-decided affordance in this codebase (`canRetry`, `payment.payable` — see
the comment on `UserRequest` in `lib/userRequests.ts`). The client only renders
`worker.arrivalStatus`; it never re-derives arrival from raw coordinates.

Why it matters: two phones on the same booking must never disagree, and a single
bad GPS fix must not permanently show "Arrived" on the customer's device while
the backend, the worker app, and the ops dashboard all still say "en route".

### 0.6 Transport: polling first, Socket.IO second

`trackUserRequest` in `lib/userRequests.ts` already documents Socket.IO as the
intended channel "the app does not carry yet". Ship phase 1 on the existing
poller with a shortened interval — that alone gives a real, moving map. Add
sockets in phase 3 for smoothness and to take load off the API.

---

## 1. Shared data contract

Agree on this section between frontend and backend **before either starts**.
Everything here is additive — no existing field changes type or meaning, so
current clients keep working untouched.

### 1.1 Client types — `artifacts/mobile/lib/userRequests.ts`

```ts
export type WorkerArrivalStatus = 'en_route' | 'arriving_soon' | 'arrived';

/** Present only once a professional has accepted. */
export interface AssignedWorker {
  id: string;
  name: string;
  phone: string;
  rating: number | null;
  jobsCompleted: number;
  distanceKm: number;

  /** GeoJSON `[lng, lat]`. Now a LIVE position, not an availability heartbeat. */
  location?: { type: string; coordinates: [number, number] };

  // ── New ──────────────────────────────────────────────────────────────────
  /** ISO timestamp of the last GPS ping. Drives the "updated Ns ago" chip. */
  locationUpdatedAt?: string;
  /** Compass heading 0–360, for a rotated marker. Null when unknown/stationary. */
  heading?: number | null;
  /** Straight-line metres to the job address, server-computed. */
  distanceMeters?: number;
  /** Road-aware ETA. Null until the routing engine has been consulted. */
  etaMinutes?: number | null;
  /** Drives the badge and header subtitle. Absent ⇒ treat as 'en_route'. */
  arrivalStatus?: WorkerArrivalStatus;
  /** True when no ping has arrived recently — render a "signal lost" chip. */
  locationStale?: boolean;
}

/** Optional route geometry, on `UserRequest`. Absent ⇒ draw a straight line. */
export interface RoutePreview {
  /** GeoJSON LineString coordinates, `[lng, lat]` pairs. */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  /** ISO — clients may ignore a route older than a couple of minutes. */
  computedAt: string;
}
```

Add to `UserRequest`:

```ts
  /** Present only while a worker is en route and routing succeeded. */
  route?: RoutePreview | null;
```

**Why a new `arrivalStatus` sub-field instead of extending `UserRequestStatus`:**
`status: 'in_progress'` already gates OTP display, cancel eligibility, the payment
lifecycle and the progress timeline across three screens. Folding
"arriving"/"arrived" into that enum means touching every one of those call sites
and re-testing transitions that have nothing to do with location. A sub-field is
purely additive.

### 1.2 Server schema

The workspace catalogs `drizzle-orm` + Postgres, but the live backend's error
shapes (`lib/api.ts` mentions a Mongo `CastError`) suggest MongoDB. Column names
below are indicative — map them onto whatever the service-request collection/table
actually is.

**On the service request document/row:**

| field | type | notes |
|---|---|---|
| `worker_lat` | `double precision` / `Number` | null until first ping |
| `worker_lng` | `double precision` / `Number` | null until first ping |
| `worker_location` | `geography(Point,4326)` / GeoJSON `Point` | preferred over the two scalars if PostGIS / a Mongo `2dsphere` index is available |
| `worker_location_updated_at` | `timestamptz` / `Date` | null until first ping |
| `worker_heading` | `real` / `Number` | 0–360, nullable |
| `worker_speed_kmh` | `real` / `Number` | nullable, used for the fallback ETA |
| `arrival_status` | enum text | `en_route` \| `arriving_soon` \| `arrived`, default `en_route` |
| `arrival_status_changed_at` | `timestamptz` / `Date` | hysteresis + analytics |
| `route_geometry` | `jsonb` / `Object` | cached OSRM LineString, nullable |
| `route_duration_s` | `int` | nullable |
| `route_computed_at` | `timestamptz` / `Date` | drives the routing cache TTL |

No separate location-history table for the MVP — the customer only ever needs the
latest ping, so this is one UPDATE per ping, not an append. Add
`worker_location_history` later **only** if disputes/support need a replayable
trail. Building it speculatively means a write-heavy table nothing reads.

---

## 2. Backend implementation plan

### 2.1 Location ingestion endpoint (worker app → server)

```
POST /api/worker/service-requests/:id/location
Authorization: Bearer <worker token>
Content-Type: application/json

{
  "lat": 22.5726,
  "lng": 88.3639,
  "heading": 143.2,        // optional, degrees
  "speedKmh": 24.5,        // optional
  "accuracy": 12.0,        // optional, metres
  "recordedAt": "2026-08-01T09:14:22.113Z"  // optional, client clock
}
```

**Validation / authorization**

1. `lat` ∈ [-90, 90], `lng` ∈ [-180, 180], both finite. Reject `0,0` — it's the
   null island and almost always a broken GPS fix, not Ghana.
2. The authenticated worker **must** be the one assigned to `:id` → otherwise
   `403`. Never trust the id alone.
3. Request `status` must be `in_progress` → otherwise `409`. Don't silently
   accept pings for a job that is completed, cancelled or expired; a worker app
   with a stale background task will keep posting for hours.
4. `accuracy > 150` metres → accept but **flag**: use it to refresh
   `locationUpdatedAt` yet don't let it trigger an `arrived` transition. A 500 m
   accuracy fix "reaching" the destination is the #1 false-arrival source.
5. Ignore `recordedAt` for ordering unless it's within ±2 min of server time; the
   server clock is the authority (same principle as `searchExpiresAt` in
   `secondsLeft()`).

**Rate limiting.** Accept at most ~1 write per 3 s per request — a timestamp
guard on `worker_location_updated_at` or a short-lived Redis key
`loc:throttle:{requestId}`. Over-limit pings return `204` (accepted, ignored)
rather than `429`, so a chatty worker client doesn't spam its own error log. The
worker app throttles client-side too (§4); this is defence in depth.

**On accepted write:**

1. Persist `worker_lat/lng/heading/speed/updated_at`.
2. Compute haversine `distanceMeters` to the request's stored job `location`.
3. Maybe refresh the route/ETA (§2.4 — throttled, not every ping).
4. Run `computeArrivalStatus` (§2.3); persist if changed, with
   `arrival_status_changed_at`.
5. Emit over Socket.IO to the customer's room (§2.5) — **every** ping, not just
   status changes. The map wants every ping; the badge only cares about changes.
6. On the first-ever transition to `arrived`, enqueue a push notification (§2.8).

### 2.2 Distance: haversine

```ts
const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
```

Cheap enough to run on every ping. This is the *straight-line* distance and is
what the geofence uses; the *road* distance/ETA comes from OSRM (§2.4).

### 2.3 The geofence — "arriving soon" and "arrived"

A pure function, independent of the HTTP handler, so it is unit-testable without
a network or DB. This is where the bugs will actually live.

```ts
export interface ArrivalThresholds {
  arrivedMeters: number;        // default 100
  arrivedEtaMinutes: number;    // default 1
  arrivingSoonMeters: number;   // default 1500
  arrivingSoonEtaMinutes: number; // default 5
  /** Once arrived, don't revert until they're clearly further out than this. */
  arrivedExitMeters: number;    // default 250
}

export function computeArrivalStatus(
  {
    distanceMeters,
    etaMinutes,
    accuracyMeters,
    previous,
    thresholds: t,
  }: {
    distanceMeters: number;
    etaMinutes: number | null;
    accuracyMeters: number | null;
    previous: WorkerArrivalStatus;
    thresholds: ArrivalThresholds;
  },
): WorkerArrivalStatus {
  // A fix this fuzzy cannot prove anything. Hold whatever we already believed.
  if (accuracyMeters != null && accuracyMeters > 150) return previous;

  // Hysteresis: once arrived, require a real pull-away, not GPS jitter, before
  // reverting — otherwise the badge flaps arrived → en_route → arrived on a few
  // metres of noise while they're standing at the door.
  if (previous === 'arrived' && distanceMeters < t.arrivedExitMeters) {
    return 'arrived';
  }

  if (
    distanceMeters <= t.arrivedMeters ||
    (etaMinutes != null && etaMinutes <= t.arrivedEtaMinutes)
  ) {
    return 'arrived';
  }

  if (
    distanceMeters <= t.arrivingSoonMeters ||
    (etaMinutes != null && etaMinutes <= t.arrivingSoonEtaMinutes)
  ) {
    return 'arriving_soon';
  }

  return 'en_route';
}
```

Notes:

- **Never let it go backwards from `arrived` to `en_route` in one step** in the
  UI. If a genuine pull-away happens (worker drove off), go straight back to
  `en_route`, but log it — it usually means a wrong address, which is an ops
  signal.
- **Make the thresholds config, not constants.** 100 m is right for a
  standalone house and wrong for a 12-tower apartment complex or a rural address
  where the pin is on the nearest road. Put the defaults in env/DB config and
  allow a per-city override later.
- **Consider a confirmation count.** Requiring 2 consecutive pings inside the
  arrival radius before flipping is a cheap extra guard against a single bad fix.
  Ship without it, add it if false arrivals show up in the data.

### 2.4 Routing & ETA via OSRM

Endpoint (self-hosted):

```
GET {OSRM_BASE_URL}/route/v1/driving/{wLng},{wLat};{jLng},{jLat}
      ?overview=full&geometries=geojson&annotations=duration
```

Response gives `routes[0].duration` (seconds), `routes[0].distance` (metres) and
`routes[0].geometry` (a GeoJSON LineString) — exactly the three things
`RoutePreview` (§1.1) needs.

**Throttling — this is the part that matters for cost and load.** Do *not* call
OSRM on every 5–10 s ping. Rules:

| Haversine distance | Route refresh interval |
|---|---|
| > 5 km | every 120 s |
| 2–5 km | every 60 s |
| 0.5–2 km | every 30 s |
| < 500 m | don't bother — show distance, ETA is noise at that range |

Also refresh immediately if the worker has deviated more than ~200 m from the
cached route line (they took a different turn), and cache the result on the
request row with `route_computed_at` as the TTL key.

**Between refreshes**, derive a cheap interim ETA so the number still moves:

```ts
// Blend the last road-route duration with elapsed progress, or fall back to a
// straight-line estimate at a conservative city speed.
const CITY_SPEED_KMH = 18; // Indian metro traffic, tune per city from real data
const fallbackEtaMinutes = (distanceMeters / 1000 / CITY_SPEED_KMH) * 60;
```

**Phase it:** for the very first cut, ship with **haversine distance only and
`etaMinutes: null`**. The frontend already handles a null ETA (§3.5) and the
geofence works purely on distance. Add OSRM once the geofence is proven — it
isolates "is my arrival logic right" from "is my routing infra right".

### 2.5 Real-time channel (Socket.IO) — phase 3

- One room per request: `request:{requestId}`.
- **Authorize the join.** Verify the bearer token → customer id → that customer
  owns `requestId`, exactly like the REST endpoint 404s on a wrong owner. Without
  this, anyone who guesses an id can subscribe to a stranger's live location.
  This is the highest-severity item in this document.
- Emit on every accepted ping:

```ts
io.to(`request:${id}`).emit('worker:location', {
  lat, lng,
  heading,
  updatedAt,          // ISO
  distanceMeters,
  etaMinutes,         // null until routing has run
  arrivalStatus,
});
```

- Emit `worker:route` separately (and much less often) when the cached route
  geometry is refreshed — the geometry is far bigger than a position and doesn't
  need to ride along on every ping.
- Emit the full `UserRequest` payload on any *other* status transition, so a
  socket reconnect after a background/foreground cycle resyncs without a REST
  round trip. The client should still do one REST fetch on foreground anyway —
  sockets drop silently more often than REST fails loudly.
- Stop emitting once the request leaves `in_progress`.

### 2.6 REST changes (phase 1 — this is what unblocks the frontend)

`GET /api/user/service-requests/:id`, `/active` and the list endpoint all include
the new fields under `worker`, plus the optional top-level `route`:

```jsonc
{
  "success": true,
  "request": {
    "id": "...",
    "status": "in_progress",
    "location": { "type": "Point", "coordinates": [88.3639, 22.5726] },
    "worker": {
      "id": "...", "name": "Ramesh K.", "phone": "98xxxxxx01",
      "rating": 4.8, "jobsCompleted": 214, "distanceKm": 1.2,
      "location": { "type": "Point", "coordinates": [88.3701, 22.5688] },
      "locationUpdatedAt": "2026-08-01T09:14:22.113Z",
      "heading": 143.2,
      "distanceMeters": 1180,
      "etaMinutes": 4,
      "arrivalStatus": "arriving_soon",
      "locationStale": false
    },
    "route": {
      "coordinates": [[88.3701, 22.5688], [88.3688, 22.5701]],
      "distanceMeters": 1420,
      "durationSeconds": 260,
      "computedAt": "2026-08-01T09:14:02.000Z"
    }
  }
}
```

Rules:

- **Identical shape on both transports.** The socket payload must be a strict
  subset of what REST returns for the same fields. If they can drift, they will,
  and you'll ship a bug that only reproduces on one of the two paths.
- `locationStale` is server-computed: `now - locationUpdatedAt > 60s`. Don't make
  the client compute it — client clocks are unreliable (this is why `secondsLeft()`
  reads an absolute server deadline rather than counting down from 60).
- **Privacy: only expose the worker's live location while `status === 'in_progress'`.**
  Strip `worker.location` from history rows and from completed/cancelled requests.
  A customer must not be able to keep watching where a professional goes after the
  job ends. Likewise, the customer's address must be visible to the worker only
  once they've accepted.

### 2.7 Config / env

| var | where | example | notes |
|---|---|---|---|
| `OSM_TILE_URL_TEMPLATE` | server + exposed to app | `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=…` | see §2.7.1 |
| `OSM_TILE_URL_TEMPLATE_DARK` | same | `…/streets-v2-dark/…` | optional, for dark theme |
| `OSM_ATTRIBUTION` | same | `© OpenStreetMap contributors © MapTiler` | required by ODbL |
| `OSRM_BASE_URL` | server only | `http://osrm:5000` | never exposed to clients |
| `NOMINATIM_BASE_URL` | server only | self-hosted or `nominatim.openstreetmap.org` | only if you add geocoding; the public one is limited to 1 req/s and requires a real `User-Agent` |
| `ARRIVAL_*` thresholds | server only | see §2.3 | |

#### 2.7.1 Two ways to give the app a tile URL — pick one

1. **Provider key restricted by app bundle id / referrer**, shipped as
   `EXPO_PUBLIC_OSM_TILE_URL` in `artifacts/mobile/.env` alongside the existing
   `EXPO_PUBLIC_API_URL`. Simplest. The key is extractable from the bundle, so it
   *must* be domain/bundle-restricted at the provider.
2. **Proxy tiles through your own API** —
   `GET /api/map/tiles/{z}/{x}/{y}.png` — with the provider key server-side and a
   CDN/`Cache-Control: public, max-age=604800` in front. Keeps the key secret and
   gives you one place to swap providers, at the cost of running the proxy.
   **Recommended for production.**

Either way the app reads the template from **one** place so switching is a config
change, not a release.

### 2.8 Push on arrival (follow-on ticket, do not block on it)

There's no push infrastructure in the app today — no `expo-notifications`
dependency, no device-token registration endpoint. The `arrived` transition is
the single moment most worth waking a backgrounded app for, but ship in-app
(foreground) handling first: badge change + haptic, which is already the pattern
in `tracking/[id].tsx`'s poller callback.

### 2.9 Backend testing checklist

- **Unit-test `computeArrivalStatus`** directly. Cases: crossing inward,
  crossing outward, hysteresis band (240 m after arrival stays `arrived`),
  low-accuracy fix holds previous, ETA-driven vs distance-driven transitions.
- **Unit-test `haversineMeters`** against 2–3 known city pairs.
- **Integration-test the ingest endpoint**: wrong worker → 403, wrong status →
  409, out-of-range lat/lng → 422, over-rate ping → 204 + no write, valid ping →
  row updated *and* socket event emitted.
- **Contract test**: assert the socket `worker:location` payload's fields are
  field-for-field equal to what `GET /api/user/service-requests/:id` returns for
  the same request state. This is the test that stops the two transports drifting.
- **Simulator script**: replay a recorded GPS trace (a JSON array of
  `{lat,lng,t}`) against the ingest endpoint at 1× speed. You will need this
  constantly during frontend work — build it early and hand it to the app team.

---

## 3. Frontend implementation plan

### 3.1 Dependency

```bash
pnpm --filter @workspace/mobile exec expo install react-native-webview
```

That's the whole dependency list. `react-native-webview` ships inside Expo Go, so
no prebuild, no dev client, no native config. It's already the "supported by Expo"
path, and `expo install` picks the version matched to SDK 54.

Add to `artifacts/mobile/.env` (the file you already have open):

```
EXPO_PUBLIC_OSM_TILE_URL=https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=XXXX
EXPO_PUBLIC_OSM_TILE_URL_DARK=https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=XXXX
EXPO_PUBLIC_OSM_ATTRIBUTION=&copy; OpenStreetMap contributors
```

Remember `EXPO_PUBLIC_*` is inlined at bundle time — changing `.env` needs a
bundler restart, not just a reload (the comment at the top of `lib/api.ts` already
makes this point).

### 3.2 New files

```
artifacts/mobile/components/map/leafletHtml.ts    — the WebView document (a template string)
artifacts/mobile/components/map/LiveTrackingMap.tsx — the RN component
artifacts/mobile/lib/liveTracking.ts              — socket client (phase 3)
```

`MapBackdrop` **stays**. It remains the right thing for the `searching` state
(there is no real position to show yet, and its radar animation communicates the
search), and it's the fallback when the map fails to load or coordinates are
missing.

### 3.3 `leafletHtml.ts` — the WebView document

A single self-contained HTML string. Leaflet comes from unpkg with SRI hashes;
the map needs network for tiles anyway, so a CDN dependency costs nothing extra.
(If you later want first-paint independence from unpkg, vendor
`leaflet.min.js`/`leaflet.css` into this same file as inline strings — the file's
shape doesn't change.)

```ts
export interface LeafletHtmlOptions {
  tileUrl: string;
  attribution: string;
  /** Job address, `[lat, lng]`. */
  destination: [number, number];
  /** Brand colours pushed in so the map matches the app theme. */
  colors: { primary: string; onPrimary: string; surface: string; text: string };
  dark: boolean;
}

export function leafletHtml(o: LeafletHtmlOptions): string {
  // Everything interpolated goes through JSON.stringify: these values come from
  // the server (address, colours from config) and this is an HTML document —
  // string-concatenating them in is a script-injection hole.
  const config = JSON.stringify(o);

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
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    /* Colours come from CONFIG at runtime, so nothing is templated into CSS. */
    .worker-dot { /* pulsing dot, tinted with CONFIG.colors.primary via JS */ }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const CONFIG = ${config};
    /* … see §3.4 for the body … */
  </script>
</body>
</html>`;
}
```

The document's job, in full:

1. Create the map, disable rotation-ish gestures you don't want, keep zoom +
   pan.
2. Add the tile layer with `attribution: CONFIG.attribution` — leave Leaflet's
   attribution control visible (§0.3).
3. Drop a **home marker** at `CONFIG.destination` (a pin matching
   `MapBackdrop`'s `home-variant` centre pin, so the two read as the same map).
4. Expose three functions on `window` for RN to call:
   `setWorker(lat, lng, heading)`, `setRoute(coords)`, `setTheme(dark)`.
5. `postMessage` back on `ready`, on marker tap, and on tile-load error (so RN
   can fall back to `MapBackdrop` if the tile provider is down).

### 3.4 Smooth marker movement (the one non-obvious bit)

Pings arrive every 5–10 s. Snapping the marker between them looks broken. Animate
*inside* the WebView so it costs zero bridge traffic:

```js
let marker = null;
let animation = null;

function setWorker(lat, lng, heading) {
  const next = L.latLng(lat, lng);
  if (!marker) {
    marker = L.marker(next, { icon: workerIcon(heading) }).addTo(map);
    fitBoth();
    return;
  }
  if (animation) cancelAnimationFrame(animation);

  const from = marker.getLatLng();
  const start = performance.now();
  // Slightly longer than the ping interval, so the marker is still gliding when
  // the next ping lands — it never sits frozen waiting.
  const DURATION = 1200;

  (function step(now) {
    const t = Math.min(1, (now - start) / DURATION);
    const eased = t * (2 - t); // easeOutQuad
    marker.setLatLng([
      from.lat + (next.lat - from.lat) * eased,
      from.lng + (next.lng - from.lng) * eased,
    ]);
    if (heading != null) rotateIcon(marker, heading);
    if (t < 1) animation = requestAnimationFrame(step);
  })(start);
}
```

Camera behaviour:

- **First position** → `map.fitBounds(L.latLngBounds([dest, worker]), { padding: [48, 48], maxZoom: 16 })`.
- **Subsequent positions** → re-fit only if the worker has left the current
  viewport, otherwise leave the camera alone. Re-fitting on every ping makes the
  map twitch and fights the user if they've panned.
- **Once the user pans/zooms manually** → stop auto-following entirely and show a
  small "Recenter" chip. Auto-camera that overrides a deliberate pan is the most
  common complaint about tracking maps.

### 3.5 `LiveTrackingMap.tsx` — the RN component

```tsx
interface LiveTrackingMapProps {
  height: number;
  /** Job address, GeoJSON `[lng, lat]` — same shape `UserRequest.location` uses. */
  destination: [number, number];
  /** Worker's live position, GeoJSON `[lng, lat]`. Undefined until the first ping. */
  worker?: [number, number];
  heading?: number | null;
  route?: RoutePreview | null;
  caption?: string;
}
```

Behaviour:

- Same `height` prop contract as `MapBackdrop`, so it drops into the identical
  layout slot in `request/[id].tsx` (line 286) with no redesign.
- **Render the HTML once.** Build it in a `useMemo` keyed on
  `[tileUrl, destination, dark]` only. If the HTML string changes identity on
  every worker ping, the WebView reloads the whole map and you get a white flash
  10 times a minute — this is the single easiest way to get this component wrong.
- Push every update through `webViewRef.current?.injectJavaScript(...)`:

```tsx
useEffect(() => {
  if (!ready || !worker) return;
  const [lng, lat] = worker;
  webViewRef.current?.injectJavaScript(
    // JSON.stringify, not template concatenation — same injection reasoning as §3.3.
    `window.setWorker(${JSON.stringify(lat)}, ${JSON.stringify(lng)}, ${JSON.stringify(heading ?? null)}); true;`
  );
}, [ready, worker, heading]);
```

- **Watch the coordinate order.** `UserRequest.location.coordinates` is GeoJSON
  `[lng, lat]` (the comment in `lib/userRequests.ts` calls this out explicitly).
  Leaflet takes `[lat, lng]`. Swap once, at the component boundary, and never
  again — a transposed pair lands you in the Indian Ocean, and it's the classic
  bug in this exact feature.
- **Fallbacks:** no `destination` → `<MapBackdrop />`. `status === 'searching'` →
  `<MapBackdrop radar />` (unchanged from today). Tile error posted from the
  WebView → `<MapBackdrop />` plus a quiet "Map unavailable" caption.
- **WebView props that matter:** `originWhitelist={['*']}`,
  `scrollEnabled={false}` (it's inside a `ScrollView` — otherwise the two fight
  for the pan gesture), `androidLayerType="hardware"`,
  `setSupportMultipleWindows={false}`, and a `renderLoading` skeleton.
- **Dark mode:** you have `useTheme()` already. Either point at the provider's
  dark tile URL (`EXPO_PUBLIC_OSM_TILE_URL_DARK`), or as a cheap stopgap apply
  `filter: invert(1) hue-rotate(180deg) brightness(0.9)` to `.leaflet-tile`.
  The real dark style looks considerably better; the filter is a one-liner.

### 3.6 UI wiring — `app/request/[id].tsx`

**Map slot** (currently lines 286–292):

```tsx
{searching ? (
  <MapBackdrop height={220} radar showExperts caption={request.address || 'Your address'} />
) : (
  <LiveTrackingMap
    height={190}
    destination={request.location?.coordinates ?? DEFAULT_CENTER}
    worker={worker?.location?.coordinates}
    heading={worker?.heading}
    route={request.route}
    caption={request.address || 'Your address'}
  />
)}
```

**Header subtitle** (currently line 268–278, hardcoded `'Professional on the way'`):

```tsx
subtitle={
  searching        ? 'Finding a professional'
  : expired        ? 'Nobody accepted'
  : paid           ? 'Paid'
  : request.payment.payable ? 'Work done — payment due'
  : arrivalSubtitle(worker)
}

function arrivalSubtitle(worker?: AssignedWorker): string {
  switch (worker?.arrivalStatus) {
    case 'arrived':       return 'Arrived at your location';
    case 'arriving_soon': return worker.etaMinutes != null
                                 ? `Arriving in ~${worker.etaMinutes} min`
                                 : 'Arriving soon';
    default:              return worker?.etaMinutes != null
                                 ? `On the way · ~${worker.etaMinutes} min`
                                 : 'Professional on the way';
  }
}
```

**Distance badge** (currently `${worker.distanceKm} km away`, line ~355): when a
live `distanceMeters` exists, prefer it and switch to metres under 1 km —
"850 m away" reads as live, "0.9 km away" reads as stale.

**Haptic + banner on arrival:** in the poller's `onUpdate`, compare the previous
`arrivalStatus` to the next one and fire
`Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` on the flip
to `arrived` — the same pattern `tracking/[id].tsx` already uses for a status
change (lines 65–70). Pair it with a persistent "Your professional has arrived"
card above the OTP block; arrival is exactly when the customer needs the start
code, so promote it at that moment.

**Stale-location chip:** when `worker.locationStale`, dim the worker marker and
show a small "Last seen 2 min ago" caption. A frozen dot with no explanation
reads as a broken app; a labelled frozen dot reads as a bad network.

### 3.7 UI wiring — `app/(tabs)/bookings.tsx`

`STATUS_META` (line 27) keys off `badge` strings. Add two:

```ts
arriving_soon: { label: 'Arriving soon', tone: 'primary', icon: 'map-marker-distance' },
arrived:       { label: 'Arrived',       tone: 'success', icon: 'map-marker-check-outline' },
```

Then in `rowFromRequest` (line 91), let the arrival status override the badge
while the top-level status is still `in_progress`:

```ts
const badge = payable
  ? 'payment_due'
  : request.payment.status === 'paid'
    ? 'paid'
    : request.status === 'expired' && request.canRetry
      ? 'retryable'
      : request.status === 'in_progress' && request.worker?.arrivalStatus === 'arrived'
        ? 'arrived'
        : request.status === 'in_progress' && request.worker?.arrivalStatus === 'arriving_soon'
          ? 'arriving_soon'
          : request.status;
```

This keeps the list card and the detail screen from ever disagreeing about what
the customer is being told.

### 3.8 Polling changes — `lib/userRequests.ts`

Phase 1 needs no new transport, just a faster tick while someone is en route:

```ts
const POLL_INTERVAL: Partial<Record<UserRequestStatus, number>> = {
  searching: 2500,
  in_progress: 8000,   // ← see below
  pending_rating: 12000,
};
```

Make the `in_progress` interval a function of arrival status rather than a
constant: **4000 ms** while `arrivalStatus !== 'arrived'` (the marker needs to
move), back to **10000 ms** once `arrived` (nobody is moving anymore, and the
screen is about to become an OTP/payment screen). Keep the existing
foreground/background suspend-and-restart handling as-is — that pattern in
`tracking/[id].tsx` (lines 89–100) is exactly right here and shouldn't change.

### 3.9 Realtime client — `lib/liveTracking.ts` (phase 3)

```bash
pnpm --filter @workspace/mobile add socket.io-client
```

- Connect scoped to the request id, authorized with the same bearer token REST
  uses.
- On `worker:location`, merge into local state **without** a REST round trip —
  this is what makes the marker glide rather than jump every 4 s.
- The poller stays running and remains the source of truth for everything that
  isn't the marker (status, payment, OTP). The socket is an addition, not a
  replacement.
- On disconnect/reconnect, don't try to reconcile partial state — let the next
  poll tick win. Same "stop and restart, trust the server" shape the app already
  uses on foreground.
- Both transports feed the same `setRequest` merge path, so nothing downstream
  (badge, timeline, OTP card) knows or cares which one produced an update.

### 3.10 What the customer app does *not* need

No new location permission on this screen. `expo-location` is already a dependency
and is used to capture the *customer's* address at booking time. Rendering someone
else's position needs no permission at all — don't prompt for one.

---

## 4. The worker app (the other client — coordinate separately)

None of this works until the professional's app actually posts pings. Whoever owns
that app needs:

- `expo-location` + `expo-task-manager` with
  `startLocationUpdatesAsync` for **background** tracking. Foreground-only
  tracking means the dot freezes the moment they switch to WhatsApp or their
  screen locks — which is most of the trip.
- **Android:** a foreground service (`foregroundService` options on the task,
  `FOREGROUND_SERVICE_LOCATION` permission) with a persistent notification. Android
  will kill background location without it. Also handle OEM battery optimisers
  (Xiaomi/Oppo/Vivo are aggressive in the Indian market — this is a real support
  cost, budget for it).
- **iOS:** `UIBackgroundModes: ["location"]` in `app.json`, `Always` authorization,
  and `activityType: 'automotiveNavigation'`.
- Client-side throttle: post at most every 5 s, or on a 25 m displacement,
  whichever is less frequent. `distanceInterval` + `timeInterval` on the task
  config does most of this for you.
- Offline queue: buffer pings when there's no network and post the *latest* on
  reconnect — not the whole backlog. Nobody needs a replay of where the worker was
  four minutes ago.
- Stop the task the moment the job leaves `in_progress`. A background location
  task that outlives its job is both a battery complaint and a privacy incident.

**Store-review note:** both stores require a clear justification for background
location. The app must explain, in-product and in the store listing, that location
is shared only with the customer of an active booking and only for its duration.

---

## 5. Rollout order

1. **Backend, phase 1** — schema (§1.2), ingest endpoint (§2.1), haversine (§2.2),
   `computeArrivalStatus` with **no OSRM** (§2.3), additive REST fields (§2.6),
   plus the GPS-trace simulator (§2.9). Ship with `etaMinutes: null` throughout.
2. **Worker app** — background location task posting to §2.1. Gates everything
   else; start it in parallel with step 1.
3. **Frontend, polling-only** — `LiveTrackingMap` + `leafletHtml` (§3.3–3.5), UI
   wiring (§3.6–3.7), faster poll (§3.8). **This is the shippable milestone:**
   real OSM map, real moving dot, correct "Arriving soon" / "Arrived", no new
   infra beyond a tile key.
4. **Backend + frontend** — Socket.IO (§2.5, §3.9). Smoother marker, less API load.
5. **Backend** — OSRM ETA + route polyline (§2.4), rendered as a Leaflet
   `L.polyline` instead of a straight line.
6. **Follow-ons** — push on arrival (§2.8); port to `tracking/[id].tsx` and
   `trial/track/[id].tsx`; tile proxy (§2.7.1 option 2) if you started on option 1.

Steps 1–3 alone deliver everything asked for. Treat 4–6 as improvements, not
blockers.

---

## 6. Things that will bite you (collected)

| Risk | Mitigation |
|---|---|
| Pointing production at `tile.openstreetmap.org` and getting blocked | §0.3 — pick a provider before writing code |
| `[lng, lat]` vs `[lat, lng]` transposition | §3.5 — swap once at the component boundary |
| WebView reloading on every ping (white flash) | §3.5 — `useMemo` the HTML, `injectJavaScript` the updates |
| False "Arrived" from one bad GPS fix | §2.3 — accuracy gate + hysteresis + optional 2-ping confirmation |
| Socket room joinable by request-id guessing | §2.5 — authorize the join, don't just trust the id |
| Worker location visible after the job ends | §2.6 — strip `worker.location` outside `in_progress` |
| Android killing the worker's background location | §4 — foreground service + OEM battery-optimiser handling |
| Socket and REST payloads drifting apart | §2.9 — contract test asserting they match |
| Missing OSM attribution | §0.3 — it's an ODbL licence requirement, keep Leaflet's control visible |
