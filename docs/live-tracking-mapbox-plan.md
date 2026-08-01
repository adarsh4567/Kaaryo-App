# Live worker tracking with Mapbox — implementation plan

Goal: on the booking detail screen (reached from "Track booking" in the Bookings
tab), replace the stylised `MapBackdrop` with a real Mapbox map that shows the
assigned worker's live position moving toward the customer's address, and
automatically flip the visible status to **"Arriving soon"** / **"Arrived"** as
the worker gets close.

Scope: this targets `artifacts/mobile/app/request/[id].tsx`, the detail screen
for on-demand bookings (`/api/user/service-requests/*`), since that's the flow
that already models an `AssignedWorker` with an (currently static) `location`
field. The same pattern applies almost unchanged to
`artifacts/mobile/app/tracking/[id].tsx` (legacy scheduled bookings) and
`artifacts/mobile/app/trial/track/[id].tsx` (trial bookings) — call that out
once the primary flow is done, don't build it three times in parallel.

---

## 0. Prerequisite decisions (read first)

These aren't implementation details, they change how the team builds/runs the
app. Confirm before backend or frontend start coding.

1. **Native module → no more Expo Go.** The Mapbox React Native SDK
   (`@rnmapbox/maps`) is a native module. It cannot run inside Expo Go, only in
   a custom dev client (`expo-dev-client` + `expo prebuild` / EAS Build). If
   the team currently develops by scanning a QR code into Expo Go (the
   `.replit` / `EXPO_PACKAGER_PROXY_URL` setup suggests this), that workflow
   needs a one-time move to a dev client build. This is the single biggest
   "gotcha" in this project — size it into the estimate.
2. **Web is out of scope for the real map.** `artifacts/mobile` also targets
   web (`react-native-web`, an app.json `web` block). `@rnmapbox/maps` has no
   web renderer. Plan: keep `MapBackdrop` as the web fallback
   (`Platform.OS === 'web' ? <MapBackdrop /> : <LiveTrackingMap />`). A real
   web map (via `mapbox-gl` JS) is a separate, later effort.
3. **Transport for live updates: Socket.IO, with polling as fallback.** The
   existing poller (`lib/userRequests.ts` → `trackUserRequest`) already has a
   comment calling out Socket.IO as the intended real-time channel that "the
   app does not carry yet." This plan adds it. Polling stays as the
   degraded-connectivity fallback, just tuned to a shorter interval while a
   worker is en route.
4. **Where "arrived" logic lives: the backend, not the app.** Distance/ETA
   calculation and the arrival threshold must be server-computed, exactly like
   every other server-decided affordance in this codebase (`canRetry`,
   `payment.payable`, etc. — see the comment in `UserRequest`). The client only
   renders `worker.arrivalStatus`, it never re-derives arrival from raw
   coordinates. This avoids the map briefly showing "Arrived" on a bad GPS fix
   only on the customer's phone while the backend still thinks otherwise.

---

## 1. Data model changes (shared contract)

### 1.1 New/changed fields on `AssignedWorker` (`lib/userRequests.ts`)

```ts
export type WorkerArrivalStatus = 'en_route' | 'arriving_soon' | 'arrived';

export interface AssignedWorker {
  id: string;
  name: string;
  phone: string;
  rating: number | null;
  jobsCompleted: number;
  distanceKm: number;
  location?: { type: string; coordinates: [number, number] }; // now LIVE, not a heartbeat
  locationUpdatedAt?: string;        // ISO timestamp of the last GPS ping
  arrivalStatus?: WorkerArrivalStatus; // NEW — drives the badge/UI
  etaMinutes?: number | null;          // NEW — null until Mapbox can compute one
}
```

Why a new `arrivalStatus` field instead of changing the top-level
`UserRequestStatus`: `status: 'in_progress'` already gates OTP display,
cancel/payment eligibility, and the progress timeline in three screens. Folding
"arriving"/"arrived" into that enum means touching every one of those call
sites and re-testing state transitions that have nothing to do with location.
A sub-field is additive: existing code that only reads `status` keeps working
untouched, and only the UI that cares about arrival reads the new field.

### 1.2 Server-side schema (assumes Postgres + Drizzle, matching
`drizzle-orm` in the workspace catalog — adjust names to the actual table)

Add to the service request / assignment table:

| column | type | notes |
|---|---|---|
| `worker_lat` | `double precision` | nullable until first ping |
| `worker_lng` | `double precision` | nullable until first ping |
| `worker_location_updated_at` | `timestamptz` | nullable |
| `worker_heading` | `real` | nullable, degrees 0–360, for a rotated marker |
| `arrival_status` | `text` (enum) | `en_route` \| `arriving_soon` \| `arrived`, default `en_route` |
| `arrival_status_changed_at` | `timestamptz` | for hysteresis + analytics |

No separate location-history table for the MVP — the customer only ever needs
the latest ping, and this is a single UPDATE per ping, not an append. Add a
`worker_location_history` table later only if support/dispute resolution needs
a replayable trail; don't build it speculatively now.

---

## 2. Backend implementation plan

### 2.1 Worker location ingestion endpoint

`POST /api/worker/service-requests/:id/location`

- Auth: worker bearer token (existing worker-side auth).
- Body: `{ lat: number, lng: number, heading?: number, speedKmh?: number, accuracy?: number }`.
- Validation:
  - `lat` in [-90, 90], `lng` in [-180, 180].
  - The authenticated worker must be the `worker` assigned to this request, and
    the request's `status` must be `in_progress` (or whatever pre-arrival state
    the worker app uses). Any other worker → 403. Wrong status → 409/422 —
    don't silently accept pings for a job that's already done or cancelled.
- Rate limit: accept at most ~1 write per 3 seconds per request
  (`arrival_status_changed_at`/`worker_location_updated_at` timestamp guard, or
  a short-lived Redis key `loc:throttle:{requestId}`). The worker app should
  already throttle client-side (see §3.1), this is defense in depth, not the
  primary throttle.
- On write:
  1. Upsert `worker_lat/lng/heading/updated_at`.
  2. Run the geofence check (§2.2).
  3. If `arrival_status` changed, persist it + `arrival_status_changed_at`.
  4. Emit the update over Socket.IO to the customer (§2.3), regardless of
     whether the arrival status changed — the map needs every ping, the badge
     only needs status-change pings.
  5. If it transitioned to `arrived` for the first time, optionally fire a
     push notification (§2.5).

### 2.2 Geofence / "arriving soon" vs "arrived" logic

Pure, testable function, independent of the HTTP handler:

```ts
function computeArrivalStatus(
  distanceMeters: number,
  etaMinutes: number | null,
  previous: WorkerArrivalStatus,
): WorkerArrivalStatus {
  // Hysteresis: once arrived, require a real pull-away (not GPS jitter)
  // before reverting, so the badge doesn't flap arrived → en_route → arrived
  // on a few metres of noise near the doorstep.
  if (previous === 'arrived' && distanceMeters < 250) return 'arrived';

  if (distanceMeters <= 100) return 'arrived';
  if (distanceMeters <= 1500 || (etaMinutes != null && etaMinutes <= 5)) {
    return 'arriving_soon';
  }
  return 'en_route';
}
```

- `distanceMeters`: haversine between the worker's last ping and the job's
  `location` (the address lat/lng already stored on the request). Cheap,
  computed on every ping.
- `etaMinutes`: from Mapbox, **not** computed on every ping — see below.
- Thresholds (100m / 1.5km / 5min) are a starting point; make them config, not
  hardcoded, since "arrived" for a dense apartment complex vs. a rural address
  wants different radii.

**Throttling the Mapbox call:** the Mapbox Directions/Matrix API is the
accurate, road-aware ETA source, but it shouldn't be hit on every 5–10s ping —
that's rate limits and cost for no benefit while the worker is still 10km out.
Recommended: only call Mapbox Directions when the haversine distance drops
under ~2km (i.e. once the customer actually starts to care about a precise
ETA), and no more than once every 20–30 seconds after that. Between calls,
degrade to a straight-line-distance/average-speed estimate. This is a
reasonable phase-2 refinement — for the very first cut, ship with haversine
distance only and no `etaMinutes` (leave it `null`, frontend already handles
that), then layer in Mapbox Directions once the geofence logic itself is
proven.

### 2.3 Real-time channel (Socket.IO)

- Namespace/room per request: `request:{requestId}`.
- Customer's app joins on mount of the detail screen (auth'd with the same
  bearer token used for REST — verify token → customer id → customer owns
  `requestId` before allowing the `join`, exactly like the 404-on-wrong-owner
  behavior the REST endpoint already has for a reason: don't let one request's
  socket room be joinable by anyone with a guessed id).
- Server emits, on every worker ping:
  ```ts
  socket.to(`request:${id}`).emit('worker:location', {
    lat, lng, heading, updatedAt, arrivalStatus, etaMinutes,
  });
  ```
- Also emit the existing `request:status` shape (or just reuse the full
  `UserRequest` polling payload) on any other status transition, so a socket
  reconnect after a background/foreground cycle doesn't need a REST round trip
  to resync — but the client should still do one anyway on foreground (see
  §3.3), sockets drop silently more often than REST fails loudly.
- Room membership ends when the request leaves `in_progress` (completed,
  cancelled) — stop emitting, let the socket disconnect naturally when the
  screen unmounts.

### 2.4 REST changes

- `GET /api/user/service-requests/:id` and the list/active endpoints: include
  the new `worker.arrivalStatus`, `worker.locationUpdatedAt`, `worker.etaMinutes`
  fields alongside the existing `worker.location`. This keeps the polling
  fallback (§3.3) fully functional without the socket — same payload shape
  either transport.
- No breaking changes to the existing response shape — everything above is
  additive and optional, matching how `AssignedWorker.location` is already
  documented as optional.

### 2.5 Push notification on arrival (recommended, separate ticket)

There's no push infrastructure in the mobile app today (no `expo-notifications`
dependency, no device token registration). Flag this as a follow-on: the
"arrived" transition is the one moment worth waking a backgrounded app for.
Don't block the map/tracking work on it — ship in-app (foreground) handling
first (badge change + haptic, already the pattern in `tracking/[id].tsx`), add
push as a phase 2 once a token-registration endpoint exists.

### 2.6 Mapbox tokens on the backend

Only needed if/when §2.2's Directions API call is added:

- A **secret** Mapbox token (`sk.*`) with default public scopes, stored as a
  server env var (e.g. `MAPBOX_SERVER_TOKEN`), never exposed to any client
  response.
- Server-to-Mapbox calls should be cached/rate-limited per the throttling rule
  above — track cost, Directions API is billed per request.

### 2.7 Testing

- Unit test `computeArrivalStatus` directly (pure function) — this is where
  the hysteresis/threshold bugs will actually live, and it needs no
  network/DB to test.
- Integration test the location endpoint: wrong worker → 403, wrong status →
  409, valid ping → row updated + socket event emitted (can assert via a test
  Socket.IO client or a mocked emitter).
- Manually verify the emitted payload matches exactly what
  `GET /api/user/service-requests/:id` returns for the same fields, so the
  socket and polling paths can never disagree in a test that only exercises one
  of them.

---

## 3. Frontend implementation plan

### 3.1 Dependencies & Expo config

```
pnpm add @rnmapbox/maps socket.io-client
```

- `@rnmapbox/maps`: add its Expo config plugin to `app.json`:
  ```json
  "plugins": [
    ["@rnmapbox/maps", { "RNMapboxMapsDownloadToken": "<sk.* download token>" }],
    ...
  ]
  ```
  The download token is **not** the runtime map token — it's a
  `DOWNLOADS:READ`-scoped secret used only at build time to fetch the native
  SDK from Mapbox's CocoaPods/Maven repos. It must live in EAS secrets /
  CI env, not committed.
- Runtime public token (`pk.*`, downloads scope `styles:tiles:fonts:read`):
  add to `.env` alongside the existing `EXPO_PUBLIC_API_URL`, following the
  same convention:
  ```
  EXPO_PUBLIC_MAPBOX_TOKEN=pk.xxxxx
  ```
  Set it once via `Mapbox.setAccessToken(...)` at app start (e.g. in
  `app/_layout.tsx`, next to other one-time setup).
- This is a native module: after adding it, the project needs
  `expo prebuild` (or an EAS dev-client build) — plain `expo start` +
  Expo Go will not pick it up. See §0.1.

### 3.2 New `LiveTrackingMap` component

New file, e.g. `artifacts/mobile/components/LiveTrackingMap.tsx`, replacing
`MapBackdrop` only for the "expert assigned / in progress" state (the
`searching` state keeps `MapBackdrop`'s radar animation — there's no real
location to show yet).

Responsibilities:
- Render a `Mapbox.MapView` + `Mapbox.Camera` sized to match the existing
  `height` prop `MapBackdrop` takes today, so it drops into the same layout
  slot in `request/[id].tsx` without a redesign.
- Two markers: the job address (static, from `request.location`) and the
  worker (from `worker.location`, updated live).
- Camera: fit both points in bounds on first render
  (`camera.fitBounds([...], padding)`), then re-fit (or ease-follow the
  worker) on every location update — animate with `animationDuration` so the
  marker glides rather than jumps between pings.
- Optional (phase 2): draw the route line via Mapbox's Directions API result
  as a `Mapbox.ShapeSource` + `LineLayer`, rather than a straight line between
  the two points. Ship the straight-line version first.
- `Platform.OS === 'web'` guard: render the existing `MapBackdrop` on web,
  since the native module isn't available there (see §0.2).

### 3.3 Realtime client + polling fallback

- New `lib/liveTracking.ts` (or extend `lib/userRequests.ts`): open a
  `socket.io-client` connection scoped to the request id, joined with the same
  bearer token used for REST calls.
- On `worker:location`, update local state directly (no REST round trip) —
  this is what makes the marker move smoothly instead of jumping every 8
  seconds.
- Keep `trackUserRequest` (the existing poller in `lib/userRequests.ts`) running
  as today, but:
  - It remains the source of truth for everything that isn't the live marker
    (status transitions, payment, OTP) — the socket is an addition, not a
    replacement.
  - Shorten `POLL_INTERVAL.in_progress` while `arrivalStatus !== 'arrived'`
    from 8000ms to something like 4000–5000ms, so a phone with the socket
    connection dropped (background, flaky network) still sees reasonably
    fresh position via the fallback. Once `arrived`, the interval can relax
    again — the worker isn't moving anymore.
  - On socket disconnect/reconnect, don't try to reconcile partial state —
    just let the next poll tick win, same pattern the existing
    foreground/background handling already uses in `tracking/[id].tsx`
    (`stopPollingRef.current?.(); startPolling();`).
- Both channels feed the same `setRequest` / `mergeRequest` update path that
  exists today, so nothing downstream (the badge, the timeline, the OTP card)
  needs to know which transport produced the update.

### 3.4 UI changes

- `request/[id].tsx`:
  - Replace the `pulsing`/`showExperts` `MapBackdrop` block for the
    `!searching` branch with `LiveTrackingMap` (fed `request.location` +
    `worker.location`).
  - Subtitle in `TrackHeader` currently hardcodes `'Professional on the way'`
    for the non-paid/non-searching case — branch it on
    `worker.arrivalStatus`:
    `'arriving_soon' → 'Arriving in ~N min'`, `'arrived' → 'Arrived'`,
    else keep `'Professional on the way'`.
  - Fire a haptic (`Haptics.notificationAsync(...Success)`) the moment
    `arrivalStatus` flips to `'arrived'`, same pattern already used for a
    status change in `tracking/[id].tsx`'s poller callback.
- `app/(tabs)/bookings.tsx`:
  - `STATUS_META` currently keys off `status`/`badge` derived purely from
    `UserRequestStatus`. Add two more badge keys (`arriving_soon`, `arrived`)
    and, in `rowFromRequest`, override `badge` with the arrival status when
    `request.worker?.arrivalStatus` is `arriving_soon`/`arrived` and the
    top-level status is still `in_progress` — so the list card and the detail
    screen never disagree about what to show.
- `tracking/[id].tsx` / `trial/track/[id].tsx`: same shape of change, once the
  primary flow is validated — don't fork three copies of `LiveTrackingMap`
  wiring in parallel, land it once in `request/[id].tsx`, then port.

### 3.5 Type/plumbing changes

- `lib/userRequests.ts`: extend `AssignedWorker` as in §1.1. Nothing else in
  that file's contract changes — `trackUserRequest`'s poller keeps working
  unmodified since the new fields are just additional properties on the same
  response.
- No new client-side location permission is needed for this feature —
  `expo-location` is already a dependency, but it's used for the *customer's*
  address capture at booking time, not for rendering someone else's live
  position. This tracking screen needs no location permission of its own.

---

## 4. Rollout order

1. **Backend**: schema migration (§1.2) + location ingestion endpoint (§2.1)
   + `computeArrivalStatus` with haversine only, no Mapbox Directions yet
   (§2.2) + REST field additions (§2.4). Ship behind the worker app also
   posting pings — coordinate that half separately, it's the other client.
2. **Frontend, polling-only**: `LiveTrackingMap` + the UI/type changes (§3.2,
   §3.4, §3.5), reading `worker.location`/`arrivalStatus` off the *existing*
   poller, shortened interval. This alone gets a real, moving-dot map and
   correct arrival badges with no new infra beyond the Mapbox SDK.
3. **Backend + frontend**: Socket.IO channel (§2.3, §3.3), for a smoother
   marker and to take load off polling.
4. **Backend**: Mapbox Directions-based ETA + route line, once the above is
   stable (§2.2 throttled call, §3.2 route line).
5. **Follow-on**: push notifications on arrival (§2.5), port to
   `tracking/[id].tsx` / `trial/track/[id].tsx`, web map fallback.

Steps 1–2 alone are shippable and already deliver "real map + correct arrival
status" — treat 3–5 as improvements, not blockers.
