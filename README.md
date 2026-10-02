# ZedBookIt

**Find it. Book it. Live better.**

A property rental marketplace and tenant-services app for Zambia (starting in Lusaka), built with
Expo, React Native, TypeScript, and Firebase. The MVP covers the full lifecycle the product is
built around:

```
DISCOVER → VIEW → RENT → LIVE → MAINTAIN → RENEW / MOVE
```

A tenant with no active tenancy sees **Find a Home** first; a tenant with an active tenancy sees
**My Home** first, with rent info, maintenance, and messaging all in one place.

---

## 1. Architecture at a glance

- **Client**: Expo (React Native + TypeScript, strict mode), Expo Router for file-based navigation
- **Backend**: Firebase — Authentication, Cloud Firestore, Cloud Storage, Cloud Messaging (push)
- **No custom backend** — all business logic lives in `src/services/*.ts` and is enforced
  server-side by `firestore.rules` / `storage.rules`
- **Four roles**: `tenant`, `landlord`, `agent`, `admin` (role is set once at signup and locked —
  a user can never change their own role from the client; see `firestore.rules`)

### Folder structure

```
app/                      Expo Router routes (file-based navigation)
  (auth)/                 onboarding, login, register, forgot-password
  (tenant)/                bottom tabs: home, explore, saved, activity, profile
  (landlord)/               tabs: dashboard, properties, maintenance, messages, profile
  (admin)/                   tabs: overview, properties, users, reports
  property/[id].tsx         property details
  viewing-request/[id].tsx   viewing request flow
  my-home/                   tenant's active-tenancy hub
  maintenance/               report wizard, request details, history
  conversation/[id].tsx      property-enquiry chat

src/
  config/firebase.ts       Firebase app/auth/firestore/storage initialization
  types/                   centralized TypeScript domain types
  theme/                   design tokens (colors, typography, spacing, shadows) + light/dark hook
  components/              design-system + feature components (Button, Card, PropertyCard, ...)
  services/                one file per Firestore concern — the ONLY place that talks to Firebase
  hooks/                   useAuth (via context), useTenancy, useFavorites, useNotifications
  context/                 AuthContext (current user + Firestore profile/role)
  constants/               locations, property/maintenance categories, amenities
  utils/                   currency, date, validators, image compression, reference numbers
```

Screens never call Firebase directly — they call functions in `src/services/`. This is what lets
you swap, say, `properties.service.ts`'s Firestore query for a real search engine (Algolia,
Typesense) later without touching a single screen.

---

## 2. What's implemented (MVP scope, per the build brief's priority order)

1. Authentication (email/password, role selection at signup) ✅
2. Tenant home (hero, search entry point, quick categories, featured/new listings, My Home banner) ✅
3. Property discovery (Explore screen, animated filter sheet, pagination) ✅
4. Property details (swipeable gallery + fullscreen viewer, amenities, sticky actions) ✅
5. Favorites (optimistic toggle, Saved screen) ✅
6. Landlord property management (dashboard, property list, per-property stats) ✅
7. Property image uploads (compressed client-side before upload) ✅
8. Viewing requests (date/time picker flow, accept/decline/cancel) ✅
9. Tenancy relationships (separate from viewing requests — see `tenancies.service.ts`) ✅
10. My Home (tenant hub for an active tenancy) ✅
11. Maintenance requests (7-step report wizard: category → details → urgency → photos → video →
    access time → review) ✅
12. Maintenance tracking (reference numbers `ZB-2026-00482`, visual status timeline, realtime) ✅
13. Maintenance messaging (kept fully separate from property-enquiry chat) ✅
14. Notifications (in-app, Firestore-backed; Expo push token registration wired up) ✅
15. Admin dashboard (platform stats, property approval queue, user suspension, reports) ✅
16. Security rules (`firestore.rules`, `storage.rules`) ✅
17. UI polish (design system, skeleton loaders, empty states, light/dark mode, haptics) ✅

Rent payments, utility payments, and other future services are intentionally **not** built — the
data model (e.g. `MaintenanceRequest.estimatedCost` / `actualCost` / `currency`) is shaped so they
can be added later without a schema rewrite.

---

## 3. Getting started

### Prerequisites
- Node.js 18+
- An Expo account (for push notifications / EAS, optional for local dev)
- A Firebase project (see below)

### Install

```bash
npm install
cp .env.example .env
# fill in your Firebase config in .env (see section 4)
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go on
a physical device.

### Type-checking & linting

```bash
npm run typecheck   # tsc --noEmit, strict mode — currently passes with zero errors
npm run lint         # eslint
```

---

## 4. Firebase setup

1. Create a Firebase project at https://console.firebase.google.com
2. Add a **Web app** to the project (Project settings → Your apps → Web) — this gives you the
   config values for `.env`
3. Enable **Authentication** → Sign-in method → Email/Password (Google/Phone can be added later;
   the auth service is structured to make this a small addition)
4. Enable **Cloud Firestore** (start in production mode — the rules in this repo replace the
   defaults)
5. Enable **Cloud Storage**
6. Copy `.env.example` to `.env` and fill in the values from step 2:

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   EXPO_PUBLIC_FIREBASE_APP_ID=...
   ```

### Deploy security rules & indexes

Install the Firebase CLI if you don't have it, then from the project root:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your Firebase project
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

### Local emulators (recommended while developing)

```bash
firebase emulators:start
```

Then set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env` and restart `npm start`. The app will
connect to Auth/Firestore/Storage emulators instead of production — useful for testing the
maintenance flow, security rules, etc. without touching real data.

### Creating the first admin

There is intentionally no "become an admin" button anywhere in the client (see `firestore.rules`
— a user can never write their own `role` after signup). To create your first admin:

1. Register a normal account in the app (role: tenant or landlord, doesn't matter)
2. In the Firebase Console → Firestore → `users/{uid}`, manually change `role` to `"admin"`
   (only you, as the project owner with console access, can do this — the client can't)
3. Log out and back in — you'll now land in the admin console

In a real production rollout, replace step 2 with a Cloud Function (`onCall`, gated by a Firebase
custom claim or an allowlist) so admin promotion has an audit trail.

---

## 5. Firestore data model

Collections: `users`, `properties`, `tenancies`, `viewingRequests`, `maintenanceRequests` (with
`timeline` subcollection), `maintenanceMessages`, `maintenanceAssignments`, `conversations`,
`messages`, `favorites`, `notifications`, `reports`, `counters` (used only for atomic maintenance
reference-number generation).

Full field-level shapes are in `src/types/index.ts` — that file is the single source of truth for
what a document looks like; services and screens both import from it.

Key modeling decisions:
- **A viewing request never implies a tenancy.** `tenancies` is a separate collection, created by
  a landlord (or admin) confirming a lease — this is what the maintenance system checks against.
- **Maintenance requests require an active tenancy.** Enforced in `firestore.rules`, not just the
  client: a create is rejected unless the referenced `tenancyId` belongs to the caller and its
  `status == 'active'`.
- **Maintenance messaging is a separate collection (`maintenanceMessages`)** from property-enquiry
  chat (`conversations`/`messages`), exactly as specified — a landlord's "I've scheduled a plumber"
  never shows up mixed in with a prospective tenant's "Is this still available?".
- **Cost fields (`estimatedCost`, `actualCost`) are hidden from tenants by default**
  (`costVisibleToTenant: false`) — a landlord/admin has to explicitly opt a request into tenant
  visibility.

---

## 6. Free-tier / cost-conscious choices

- Firestore's **persistent local cache** is enabled (`src/config/firebase.ts`), so repeat app
  opens don't re-fetch data that's still fresh
- Property search uses **pagination** (12 per page) rather than loading full collections
- Realtime `onSnapshot` listeners are used **only** where the brief calls for it: maintenance
  status/timeline, maintenance chat, property-enquiry chat, and notifications — everything else
  (property search, dashboards, history) is a one-shot `getDocs`
- Admin stats use `getCountFromServer` (a small aggregation read) instead of downloading every
  document just to count them
- Images are **resized to 1600px and compressed to JPEG q0.7** client-side before upload
  (`src/utils/image.ts`)
- View-count increments are fire-and-forget and swallow errors — a missed view count is never
  worth a retry budget or a blocked UI

---

## 7. Security model (`firestore.rules` / `storage.rules`)

- Every write is checked against the **caller's own Firestore `users/{uid}` doc** for role — never
  trusted from the request body
- A user can create their own `users/{uid}` doc only with `role` in `['tenant','landlord']` and
  `isSuspended: false`; **role and suspension state are locked after creation** from the client —
  only an admin, or you via the console, can change them
- A landlord can create/update their own properties but **cannot self-approve, self-verify, or
  reassign ownership** — `status` can only move to `approved`/`rejected`/`suspended` via an admin
  write
- A maintenance request can only be created against a tenancy the caller owns **and** that is
  currently `active` (checked via a rules-side `get()` on the referenced tenancy)
- A tenant can read/act on their own maintenance requests and messages; a landlord can read/act on
  requests for their own properties; nobody can read another party's data
- Storage: property photos are publicly readable (they're marketing images for approved listings);
  maintenance photos/videos and profile photos require authentication
- Full deny-by-default fallback at the bottom of `firestore.rules`

### Known limitation — read before wider rollout
`notifications` document **creation** is currently open to any signed-in user (a tenant's client
writes the landlord's "new viewing request" notification directly, etc.). This was a deliberate
MVP trade-off to avoid needing Cloud Functions for the first pass — it lets a malicious signed-in
user spam another user's notification feed, but it does **not** leak any data (reading a
notification is still locked to its owner). Before a public launch, move notification creation
into a Cloud Function trigered off the underlying writes (new `viewingRequests` doc, maintenance
status change, etc.) and remove client-side `create` access entirely.

---

## 8. Known limitations & recommended next steps

These were deliberately scoped out of this pass, per the brief's own "don't overbuild the MVP"
guidance (section 44) — listed here so they're a clear backlog, not a surprise:

- **No Cloud Functions yet.** Reference-number generation uses a client-side Firestore
  transaction (safe and atomic, but a Cloud Function would be more defensible long-term).
  Notification fan-out (see above), push delivery via FCM, and server-side validation beyond
  Firestore Rules would all benefit from moving into Functions.
- **Push notification delivery isn't wired server-side.** The client registers an Expo push token
  onto `users/{uid}.fcmTokens` on login (`src/services/push.service.ts`) — a Cloud Function still
  needs to read that array and actually call the Expo/FCM push API when, e.g., a maintenance
  status changes.
- **Map view** is architected for (a placeholder is shown on the property details "Location"
  section, and `Property.location.latitude/longitude` already exist) but not implemented.
- **Pinch-to-zoom** on the property gallery isn't implemented — the gallery supports swipe and a
  fullscreen viewer, but true pinch-zoom needs either a native zoom library or non-trivial custom
  gesture math.
- **Full-text search** isn't implemented (nor should it be with Firestore alone) —
  `properties.service.ts#searchProperties` is the single seam a real search engine (Algolia,
  Typesense, Meilisearch) would replace.
- **The admin console lives inside the mobile app** (gated by role), rather than as a separate web
  app. This was a deliberate scope decision for the MVP — a dedicated web admin dashboard (Section
  26 of the brief) is a reasonable next project once the mobile app is live.
- **Google/Phone auth** aren't wired up yet — `auth.service.ts` is structured so adding them is a
  small, additive change, not a rewrite.
- **Tests**: none yet. `npm run typecheck` (strict TypeScript, currently passing) and `npm run
  lint` are the current safety nets; adding Jest + React Native Testing Library for the service
  layer (which is pure, mockable Firebase calls) would be the highest-value next addition.
- **This has not been run on a real device, simulator, or live Firebase project** — it has been
  verified by `npm install`, `tsc --noEmit` (0 errors), and `eslint` (0 errors) in this build
  environment, which does not have a mobile simulator or a real Firebase backend attached. Treat
  the first `npm start` against your own Firebase project as the real integration test.

---

## 9. Design system

`src/theme` defines the full token set (colors for light/dark, typography scale, spacing, radius,
shadows) and a `useTheme()` hook every component pulls from — no hard-coded hex values in
screens. The direction is **Apple × Airbnb × premium fintech**: system fonts, generous whitespace,
soft shadows, a deep-emerald accent with a warm copper secondary, image-first cards, and skeleton
loaders everywhere data is in flight so the app never shows a blank screen.

---

## 10. Commands reference

```bash
npm start              # start Metro/Expo dev server
npm run android        # open on Android emulator/device
npm run ios            # open on iOS simulator/device
npm run web            # run in a browser (Expo web)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
firebase emulators:start
```


## Testing & validation

```bash
npm ci
npm run typecheck
npm run lint
npm test            # unit tests (auth state machine, properties, viewing requests, errors, dates)
npm run test:rules  # Firestore security-rules tests — needs the Firebase emulator + Java (firebase-tools)
npx expo export --platform android   # production bundle check
```

See `FINAL_QA_REPORT.md` for results, root causes and deployment steps, and `MONETIZATION.md` for revenue options.
