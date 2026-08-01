# Worker profile photo — backend spec

Goal: the booking detail screen (Bookings tab → tap the tracking card →
`/api/user/service-requests/:id`) shows the assigned worker's name and
rating, but has never had a photo to show — the client renders a plain
initials avatar because the field doesn't exist in the API response. This
doc specifies the one field the backend needs to add, and where.

Scope: this covers the on-demand/instant booking contract only —
`/api/user/service-requests/*`, described in
`artifacts/mobile/lib/userRequests.ts`. That's the flow behind every
"Book Worker" instant booking on the Home tab (all three sections: house
help, deep cleaning, repairs). The legacy scheduled-booking contract
(`lib/api.ts`, used by `app/tracking/[id].tsx`) and the discounted-trial
contract (`lib/userTrials.ts`, used by `app/trial/track/[id].tsx`) have the
same "no photo" gap and the same initials-avatar fallback, but are separate
contracts — out of scope here, worth a follow-up doc if the backend wants
to cover them the same way.

---

## 0. Open backend bug — `photoUrl` is built from `localhost`

**Status: the field ships, the URL host is wrong.** Observed value:

```
http://localhost:4000/uploads/profilePhoto_6a6df7dd3b1d40d658e4b778_340034365.jpg
```

`localhost` is resolved by whoever loads the URL. On a phone that's the phone
itself, so the request never leaves the device:

```
Failed to connect to localhost/127.0.0.1:4000
```

The file itself is fine — the same path on the API host returns the image:

```console
$ curl -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' \
    http://40.192.6.26:4000/uploads/profilePhoto_6a6df7dd3b1d40d658e4b778_340034365.jpg
200 image/jpeg 177243
```

So nothing is wrong with upload, storage or static serving. The only defect is
the **base URL** used to build the absolute link — it's being taken from a local
default (or a bare `localhost` fallback) instead of the address clients use.

**Fix:** drive that base from the deployment's public address, e.g. a
`PUBLIC_BASE_URL` / `APP_URL` env var set per environment, and never fall back
to `localhost` outside local development. Alternatively, **return a relative
path** (`/uploads/<file>`) and let each client resolve it against the API origin
it already knows — that removes the whole class of bug, since the server then
never has to know its own public hostname.

Until this lands, the app rewrites loopback hosts (`localhost`, `127.0.0.1`,
`0.0.0.0`, `::1`) onto the configured API host so photos render. That workaround
is deliberately limited to loopback — once the backend sends a correct absolute
URL, or a relative path, it stops applying on its own with no client change
needed. It is not a substitute for the fix: any non-mobile consumer of this API
hits the same broken URL.

## 1. What the client already expects

`AssignedWorker` in `artifacts/mobile/lib/userRequests.ts` now has:

```ts
export interface AssignedWorker {
  id: string;
  name: string;
  phone: string;
  photoUrl?: string | null;   // ← new, added client-side ahead of this doc
  rating: number | null;
  jobsCompleted: number;
  distanceKm: number;
  // ...live-tracking fields omitted, unrelated to this change
}
```

`photoUrl` is optional and nullable **on purpose** — the client already
renders gracefully with it absent:

- Present → shows the photo (`app/request/[id].tsx`, the worker card at the
  top of the booking detail screen).
- `null` / absent → shows the existing initials-avatar circle. Nothing
  breaks, no blank space, no crash.

This means the backend can ship this whenever it's ready — including
worker-by-worker, if photo capture is rolled out gradually during
onboarding — without coordinating a simultaneous client release. It also
means there's no obligation to backfill photos for every existing worker
before shipping; workers without one just keep showing initials.

## 2. What to add

Add `photoUrl` to the worker object returned inside `request.worker` for
**every** endpoint that can return an assigned worker:

| Endpoint | Method |
|---|---|
| `/api/user/service-requests` | `POST` (create) |
| `/api/user/service-requests/:id` | `GET` |
| `/api/user/service-requests/active` | `GET` |
| `/api/user/service-requests` | `GET` (list — history rows omit `worker` entirely already, that's unchanged) |
| `/api/user/service-requests/:id/retry` | `POST` |
| `/api/user/service-requests/:id/payment/initiate` | `POST` |
| `/api/user/service-requests/:id/payment/confirm` | `POST` |

All seven return the same `request` object shape (see the comment on
`UserRequest` in `userRequests.ts`: "the one shape every endpoint
returns"), so in practice this is **one field, one place** in whatever
serializer builds the `worker` sub-object — not seven separate changes.

### Field contract

- **Name:** `photoUrl`
- **Type:** string or `null` — omitting the key entirely is also fine, the
  client treats missing and `null` the same way.
- **Value:** an absolute, public HTTPS URL. The client loads it directly
  with no auth header (React Native `Image`), so it cannot be a URL that
  requires a bearer token or signed cookie to resolve — use a public CDN
  URL or a long-lived signed URL (S3/GCS pre-signed with a far expiry),
  not a route that needs `Authorization`.
- **Image itself:** square headshot, ~256×256 is plenty for how it's
  rendered (a 64×64 circle on screen, so anything sharper is wasted
  bandwidth). JPEG or WebP. No transparency requirements since it renders
  inside a filled circle.

### Sample response (today vs. after this change)

```jsonc
// GET /api/user/service-requests/:id — worker sub-object, today
{
  "worker": {
    "id": "wrk_9f2a",
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "rating": 4.8,
    "jobsCompleted": 214,
    "distanceKm": 1.4
  }
}
```

```jsonc
// After this change
{
  "worker": {
    "id": "wrk_9f2a",
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "photoUrl": "https://cdn.kaaryo.example/workers/wrk_9f2a/photo.jpg",
    "rating": 4.8,
    "jobsCompleted": 214,
    "distanceKm": 1.4
  }
}
```

## 3. Source of the photo (backend's call, flagging the obvious options)

Not prescribing this since it depends on what the worker-onboarding
pipeline already captures, but the two likely sources are:

1. **Onboarding KYC selfie/photo**, if one is already collected for
   identity verification — reuse it rather than asking workers for a
   second photo.
2. **A dedicated profile-photo upload**, if onboarding doesn't currently
   capture a customer-presentable image (e.g. the KYC shot is a
   selfie-with-ID-card style photo, not something you'd want to show a
   customer).

Either way, the contract from §2 is the same — the app only needs a
stable public URL, it doesn't care how the backend got there.

## 4. Client-side status

Already done, ahead of the backend change, so nothing further is needed on
the mobile side once the field starts arriving:

- `AssignedWorker.photoUrl` added — `artifacts/mobile/lib/userRequests.ts`.
- `app/request/[id].tsx` renders `<Image source={{ uri: worker.photoUrl }}>`
  when present, falls back to the initials avatar otherwise.

Follow-up (not blocking this): the same initials-only avatar pattern also
exists in `app/tracking/[id].tsx` (legacy scheduled bookings) and
`app/trial/track/[id].tsx` (trial bookings), each with their own worker
type. If the backend wants photos to show there too, that's a small
follow-on to this doc, not a blocker to shipping this one.
