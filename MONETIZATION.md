# Monetization options for ZedBookIt (design notes — nothing is implemented)

No payment code exists in the app and none was added. Payments must never trust a client-side "paid" claim.

## Where it fits cleanly
- Listings already pass through a moderation state (`pending → approved`, `isVerified`): a natural place for
  **listing fees** or **verification fees** (admin approves only after a server-confirmed payment).
- `properties` has room for `featuredUntil`, `plan`, `boostedAt` fields (server-written only; rules already block
  landlords from editing verification/status fields).
- Viewing requests are discrete, timestamped events between two identified users → usable for **lead/viewing fees**
  or per-lead credits for landlords/agents.
- Roles (`landlord`, `agent`) support subscription tiers per account (`users/{uid}.plan`, server-written).

## Options (by fit for Zambia)
1. **Landlord listing fee** (per listing/month) — simplest, predictable; pay via MTN/Airtel Mobile Money.
2. **Featured/boosted listings** — pay to appear in "Featured homes" (the Home screen already has that section).
3. **Agent/landlord subscription plans** — tiers by number of active listings; agents typically have many.
4. **Verification fee** — paid site-visit verification badge (`isVerified` already drives a badge).
5. **Lead/viewing fees** — small fee (or credit) when a landlord accepts a viewing request.
6. **Property-management subscription** — tenancies, maintenance requests and messaging already exist; charge per managed unit.
7. **Tenant premium services** — e.g. early access to new listings, move-in packages; keep core search free.
8. **Sponsored listings/ads** from movers, furniture and utilities providers.

## Requirements before any payment feature ships
- Payment initiation and confirmation happen on a **server** (Cloud Function or the existing Cloudflare Worker) using the
  provider's webhook/callback; the server writes `payments/{id}` and entitlement fields. Clients can only read them.
- Add Firestore rules so entitlement fields (`plan`, `featuredUntil`, `isVerified`, `status`) are not client-writable
  (already true for properties today).
- Idempotent webhooks, amount/currency (ZMW) verification, reconciliation reports, refund policy, and compliance with
  Bank of Zambia / mobile-money aggregator requirements.
- Recommended order: listing fees + featured boosts first (lowest engineering risk, clear value), subscriptions second.
