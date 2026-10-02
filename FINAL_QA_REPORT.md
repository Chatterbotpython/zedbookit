# ZedBookIt — Final QA Report

Scope: full audit of the uploaded `zedbookit.zip`, fixes for the three reported bugs, security/rules
review, and validation. Everything below marked **PASS** was actually executed in the build sandbox;
anything that needs Firebase production access, an emulator or a device is listed under
*Remaining limitations* and is **not** claimed as passing.

## Fixed issues

| # | Issue | Status |
|---|-------|--------|
| 1 | Correct credentials → bounced back to login/onboarding | Fixed (auth state machine + route guards) |
| 2 | Empty property DB shows "Failed precondition / Something went wrong" | Fixed (query shapes, indexes, fallback, real empty state) |
| 3 | Tenants can't request a viewing ("Something went wrong") | Fixed (payload, error handling, rules/data-model aligned) |
| 4 | Landlords/agents had no way to see, accept or decline viewing requests | Added `app/(landlord)/viewings.tsx` |
| 5 | Tenants couldn't cancel a pending request | Added (Activity tab, confirm dialog) |
| 6 | Landlord replies in property chats went to a different thread the tenant never saw | Fixed (thread ids parsed from the conversation id) |
| 7 | Raw Firebase codes shown to users in admin/landlord screens (e.g. `(permission-denied)`) | Replaced by central mapper |
| 8 | Several `.then()` calls with no `.catch` (unhandled rejections, endless skeletons) | Fixed |
| 9 | Favorites/tenancy/notification hooks could hang or throw on a secondary query failure | Fixed |
| 10 | Firestore rules gaps (see Firebase validation) | Tightened |

## Root causes

**Bug 1 – login bounce (definite, from the code).** `AuthProvider` set `isLoading=false` after the
*initial* "no user" event. On login Firebase then fired a user event; the provider stored
`firebaseUser` and only *afterwards* awaited the Firestore profile. During that window
`isLoading` was `false`, `firebaseUser` was set and `profile` was `null`, and `app/index.tsx`
treated `!profile` as "signed out" and redirected to onboarding/login. Compounding factors:
the profile fetch had no `try/catch` (a permission/network error left the app in an inconsistent
state); a brand-new registration fires the auth event *before* `users/{uid}` is written (same
"profile null" window); nothing guarded the role route groups; suspended/missing/corrupt
profiles had no defined destination.
**Fix:** `src/auth/authState.ts` (pure state machine: `initializing → loading_profile →
authenticated | unauthenticated | profile_missing | suspended | error`), `AuthContext` moves state
atomically per auth event with stale-result protection and profile retry, `RoleGuard`/`GuestGuard`
on every route group, entry route waits while unresolved, new `account-status` screen (retry / sign out)
so there is no redirect loop.

**Bug 2 – FAILED_PRECONDITION.** Firestore returns `failed-precondition` for a query whose composite
index doesn't exist *regardless of whether the collection is empty*. Causes found in the code:
(a) Explore combined `status`+`city`+`type` (no such index), amenity equality filters and a
`bedrooms >=` inequality with `orderBy(createdAt)` — an invalid/unindexable shape;
(b) the app showed `Couldn't load properties (failed-precondition)`;
(c) Home swallowed errors into `[]`. I can't see your live project, so I can't say which of these
your deployment hit first — most likely the indexes hadn't been deployed/built.
**Fix:** only `status`/`city`/`type` go to the server (each combination has an index); area, bedrooms,
bathrooms, price and amenities are filtered in-app with a multi-fetch page filler; added the missing
`status+city+type+createdAt` index and removed unused/redundant ones; if Firestore still answers
`failed-precondition` the app transparently falls back to an index-free query (only needs the automatic
`status` index) so an empty marketplace still shows *"No properties available yet — Check back soon"*
with Refresh; every error path uses friendly copy.

**Bug 3 – viewing request.** Definite defects on the path: the request payload contained
`message: undefined` whenever the tenant left the optional message blank, and the Firestore SDK
throws *"Unsupported field value: undefined"* for that — surfaced to the user as the generic
"Something went wrong" (the previous mapper had no case for it). Also the notification write was
awaited in the same try block, so a notification failure made a *successful* request look failed;
"property not found" was thrown as a plain `Error` and mapped generically.
**Fix:** `ignoreUndefinedProperties` on Firestore + optional fields omitted explicitly; landlord id
derived from the property doc (never trusted from the UI); property must be `approved`; deterministic
document id (double-tap safe); duplicate-open-request guard; slot validation (real dates, allowed times,
≤60 days, no past times); notification best-effort; rules now validate exactly this payload.
*If a viewing request still fails on your project after deploying the rules, the app now logs
`[ZedBookIt] viewingRequest.submit failed (<firebase code>)` — send me that line.*

## Files changed (important ones)

- `src/auth/authState.ts` (new), `src/context/AuthContext.tsx`, `src/components/RouteGuard.tsx` (new),
  `src/components/FullScreenLoader.tsx` (new), `app/index.tsx`, `app/account-status.tsx` (new),
  `app/_layout.tsx`, `app/(auth|tenant|landlord|admin)/_layout.tsx`, `app/(app)/_layout.tsx` (new:
  shared signed-in screens moved from `app/property`, `app/viewing-request`, `app/maintenance`,
  `app/my-home`, `app/conversation` into the `(app)` group — URLs are unchanged).
- `src/config/firebase.ts` — `ignoreUndefinedProperties`, hot-reload-safe init, persistent cache only on web.
- `src/services/errors.ts` — central error mapper + logger. `src/hooks/useAsyncData.ts`, `src/components/ErrorState.tsx` (new).
- `src/services/properties.service.ts` — defensive parsing, index-safe search, fallback.
- `src/services/viewingRequests.logic.ts` (new pure rules/state machine), `viewingRequests.service.ts`, `src/constants/viewing.ts` (new).
- `app/(app)/viewing-request/[propertyId].tsx`, `app/(tenant)/{home,explore,saved,activity}.tsx`, `app/(app)/property/[id].tsx`,
  `app/(landlord)/{dashboard,viewings,messages/index,…}.tsx`, `app/(app)/conversation/[id].tsx`.
- `firestore.rules`, `firestore.indexes.json`, `src/services/{users,messaging,notifications}.service.ts`, `src/utils/date.ts`.
- Tests: `tests/unit/*` (66 tests), `tests/rules/*` (emulator suite, not run here), `vitest*.config.ts`.
- `.env` **removed** from the delivered ZIP → `.env.example`.

## Tests run (sandbox, Node 22)

```
npm ci                                   PASS  (1408 packages)
npm run typecheck                        PASS  (0 errors)
npm run lint                             PASS  (0 errors, 0 warnings; baseline had 14 warnings)
npm test  (vitest, 5 files)              PASS  66 / 66
worker: npm test (R2 upload signer)      PASS  11 / 11   (worker code unchanged)
npx expo export --platform android       PASS  (Metro bundled 3467 modules → Hermes bundle)
```

Unit coverage: state-machine routing for tenant/landlord/agent/admin, loading never = signed out,
missing/corrupt/suspended/error profiles, profile retry (registration race), error mapping (bad password,
network, viewing, index errors, no raw Firebase text), zero/one/many properties, paging + cursors,
client-side filters, defensive parsing of empty legacy documents, viewing creation (valid, not signed in,
wrong user, missing/non-approved property, own property, duplicate, re-request, bad slots, undefined-field
regression, notification-failure regression), full transition matrix (tenant cancel; landlord
accept/decline/complete; all invalid transitions rejected), date/timezone handling, ZMW/phone formatting.

## Firebase validation

Reviewed: all of `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and every query in `src/services`.
Rules changes:
- `viewingRequests`: create limited to a tenant, own uid, approved property, landlord == property owner, not own property,
  whitelisted fields, allowed slot/date format, size limits, server timestamps, deterministic id; updates enforce
  the state machine (tenant `pending→cancelled`; landlord `pending→accepted|declined`, `accepted→completed`),
  only `status`/`updatedAt` may change.
- `users` create: field whitelist (role still limited to tenant/landlord; agent/admin provisioned by admin only).
- `properties.savedCount`: ±1 only in the same atomic write that creates/deletes the caller's own favorite doc.
- `conversations`: only the tenant can create an enquiry thread, for an approved property, exact 2 participants, id must match;
  later writes may only change the last-message preview. `messages`: field whitelist + size limit.
- `notifications` create: field whitelist, `isRead=false`, no self-notify, size limits.
- Nothing was made more permissive; no `allow … if true` was introduced.
Indexes: added `properties(status, location.city, type, createdAt)`; removed `properties(status, location.area/bedrooms,…)`
(now in-app), and equality-only composites (`tenancies`, `notifications`, `favorites`) that single-field indexes already serve.
Storage: `storage.rules` reviewed, unchanged. NOTE the client uploads to Cloudflare R2 via the Worker, not Firebase Storage,
so these rules only matter if you re-enable Firebase Storage.

## Remaining limitations (not tested / not done)

- **Firestore rules were not executed.** The emulator jar can't be downloaded in this sandbox. An emulator suite is included
  (`tests/rules/`); run it before deploying: `npx firebase-tools emulators:exec --only firestore --project demo-zedbookit "npx vitest run --config vitest.rules.config.ts"`.
  The rules text was only checked for balanced delimiters. **Treat the rule changes as unverified until that suite passes.**
- **No live Firebase, no device/simulator.** Login/logout/session restoration for each role, image upload, push notifications,
  slow-network behaviour and pull-to-refresh were validated by logic tests and code review, not on a phone. Please smoke-test
  tenant, landlord, admin (and an agent) on a real device/Expo Go.
- `expo-doctor`, iOS/EAS builds and web export were not run. `npm audit` was not run.
- Agent role: agents use the landlord experience; there is no self-registration (create by setting `role: "agent"` on
  `users/{uid}` in the console/Admin SDK).
- Notification documents are still created by clients (spam risk is reduced, not removed); a Cloud Function should own this.
  `viewCount` can still be inflated by any signed-in user. Search is not full-text; price/area/bedroom filters run in-app.
- Registration doesn't collect a phone number (helper `normalizeZambianPhone` exists and is used if provided).
- No fake/seed data was added.

## Firebase deployment steps

1. `cp .env.example .env` and fill in your Firebase web config (and R2 endpoints).
2. `firebase deploy --only firestore:indexes` — wait until every index shows *Enabled* in the console (can take minutes).
3. Run the rules test suite (above), then `firebase deploy --only firestore:rules`.
4. Existing users/properties keep working (parsers default missing fields). Make sure real listings have
   `status: "approved"` (admin approval) and `landlordId` set, or tenants can't see/request them.
5. Smoke test: tenant login → browse (empty state) → landlord adds property → admin approves → tenant requests viewing →
   landlord accepts → tenant sees status.

---

# Follow-up pass (v2)

## Login: "profile not found" for every account
The profile loader only reports "missing" when Firestore returns **no `users/{uid}` document in the
Firebase project the app is configured for**, or the document's `role` is unusable. Changes:
- `account-status` now shows the real reason, the account ID and the Firebase project ID in use
  (compare these with the Firebase console: `users/<account ID>` must exist in that project).
- Roles that differ only by case/whitespace (`"Admin"`, `" landlord "`) are accepted by the client.
  NOTE: firestore.rules still compare exactly (`'admin'`), so fix the value in the console too.
- An Auth user with no profile document can now "Finish setting up" (tenant/landlord). This create is only
  allowed by the rules when the document does not exist and can never create an admin or change a role.
- Admin accounts: create/repair `users/<uid>` in the console with `role: "admin"` (lowercase),
  `isSuspended: false`, plus `firstName`, `lastName`, `email`.
- Removed the redundant `router.replace("/")` after login.

## Viewing requests
- Rules bind the request id to the payload: `{uid}_{propertyId}_{date}_{HHmm}` plus optional `_N`.
- New `viewingLocks/{uid}_{propertyId}` document, written in the same batch as the request and removed in
  the same batch when the request becomes declined/cancelled/completed => server-enforced single active request
  per tenant per property.
- `accepted -> cancelled` now allowed for tenant and landlord; `completed` only once the slot time has arrived.
- Viewing queries fall back to an unordered query when the composite index is missing; the duplicate pre-check can
  no longer block a submission.

## Rules hardening
users: `email` must match the sign-in email and is no longer editable; landlords cannot change an approved
listing's content without going back to `pending`, cannot touch `suspended` listings; owners can't bump their own
`viewCount`; notifications require a known type and a genuine shared viewing/maintenance request; favorites ids
are bound to `{uid}_{propertyId}`; reports and tenancies have field whitelists; tenancies require a real tenant.

## Verification in this pass
| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npx vitest run` | PASS 70/70 |
| `npx expo export --platform android` | PASS |
| `npm run test:rules` (emulator) | Run by the project owner on Windows: 23/24 passed on first run (all viewing-request, lock, property, notification tests). 1 failure in the users-create test, addressed in v3 below. |

The rules text and `tests/rules/firestore.rules.test.ts` were updated but the rules have never been executed.
Run `npm run test:rules` locally BEFORE `firebase deploy --only firestore:rules`.

## v3
- Emulator run (owner's machine) showed 23/24 passing; the failing case was the new-user profile create.
  The test also wrote the same user document twice (second write is an update and is correctly denied) - fixed by
  splitting it into tenant / landlord / optional-phone cases with separate users.
- `users` create rule: the email-vs-token comparison is now skipped only when the sign-in token has no email claim
  (never the case for email/password accounts) and the stored email is capped at 254 chars.
- STILL TO CONFIRM: re-run `npm run test:rules`. If the first new-user test still fails, send `firestore-debug.log`.

---

# v4 - five requested changes

| # | Change | Where |
|---|---|---|
| 1 | Multiple pending properties | root cause: wizard state in a persistent hidden tab (see below); `app/(landlord)/properties/add/index.tsx` |
| 2 | `vacant` / `sold` statuses | `src/constants/propertyStatus.ts`, `src/types`, landlord + admin screens, `firestore.rules`, property queries |
| 3 | Up to 30 photos | `src/constants/limits.ts`, `src/utils/photos.ts`, add wizard, `firestore.rules` |
| 4 | Tenant-chosen viewing time | `src/services/viewingRequests.logic.ts`, `src/constants/viewing.ts`, viewing screen, `firestore.rules` |
| 5 | Tenant name in landlord Messages | `src/utils/conversation.ts`, `messaging.service.ts`, conversation + messages screens, `firestore.rules` |

## 1. Why a landlord seemed limited to one property
There is no pending-count check in the services or the rules. The cause was the add-property screen:
it is a hidden *tab*, and tab screens stay mounted after you leave them. After the first submission the wizard
still held that property's id (`createdPropertyId`) and the old form. A second "Add property" therefore re-used
property A's id and attached its photos to A instead of creating B. The wizard now resets completely after a successful
submit, and a failed upload offers "Discard and start a new listing". Rules and services were verified to allow any number
of simultaneous `pending` listings (see tests).

## 2. Status model
- `vacant` = listed for tenants (same public visibility as `approved`). `rented`, `sold` = not listed.
- Public queries use `status in ['approved','vacant']` (served by the existing composite indexes - no index change).
- Owner transitions (rules + `canOwnerChangeStatus`): approved/vacant/rented/sold may move among vacant/rented/sold,
  or to pending/inactive. pending/inactive/rejected can NEVER jump to a live status (that would skip admin review);
  suspended is admin-only.
- While a listing is live, an owner may only change status, price and rent frequency; any other content edit must
  go back to `pending` (review) or `inactive`.
- Admin screen gains Vacant / Rented / Sold tabs; dashboard "active" counts include vacant.

## 3. Photos
`MAX_PROPERTY_PHOTOS = 30` (one constant). New picks are merged into the existing selection (de-duplicated, capped, user
told what was left out). Uploads run 3 at a time. The worker already accepted indexes up to 99 (now covered by a test).
Rules cap `photos` at 30 on create/update (mirrors the constant). Existing properties with 10+ photos parse unchanged.

## 4. Viewing times
The 6-slot whitelist is gone. Tenants type a 24-hour `HH:mm` (auto-formatted, validated live) or tap a quick-pick chip.
Valid window: 06:00-20:00 (`VIEWING_EARLIEST_TIME`/`VIEWING_LATEST_TIME`, mirrored in the rules - change both together).
Past times today are rejected; 60-day limit, one-active-request lock and id binding are unchanged
(the id carries the exact time, e.g. `uid_propertyId_2026-10-05_1315`).

## 5. Tenant name
The tenant's message stores `tenantName` (first + last name only, max 80 chars) on the conversation; only the tenant can
set it, a landlord's reply can never change it, and no other profile data is stored. Landlord Messages and the
conversation header show it; older conversations fall back to "Tenant enquiry" until the tenant next writes.

## Verification run for v4
| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npx vitest run` | PASS 102/102 (6 files) |
| `cd worker && npm test` | PASS 12/12 |
| `npx expo export --platform android` | PASS |
| `npm run test:rules` (emulator) | NOT RUN here (no emulator download access). New tests added; run before deploying. |

New rules tests to watch on first run: the `in` discovery query (approved + vacant), string comparison of the
viewing-time window, and the conversation `tenantName` update cases.
