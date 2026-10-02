> **Superseded.** This file describes an earlier pass. See `FINAL_QA_REPORT.md` for the verified, current list of fixes and test results.

# ZedBookIt fixes applied

This build contains a security/functional integration pass over the original ZIP.

## Fixed

- Firestore list/query permissions for tenancies, viewing requests, maintenance requests, conversations, messages, and maintenance messages.
- Property list access now requires approved listings for public discovery or ownership/admin access.
- User profile reads are restricted to the account owner/admin instead of exposing private profile fields to every signed-in user.
- Property owner edits are field-constrained and landlords cannot self-approve listings.
- Property view and saved counters are restricted to narrowly scoped counter increments.
- Favorite add/remove is now atomic and idempotent so savedCount cannot drift from repeated taps/races.
- Tenancy creation verifies that the landlord owns the referenced property and that the property is approved/rented.
- Tenancy updates cannot change tenant/property/landlord identity fields.
- Viewing requests verify the property is approved and the landlord owns it; updates are field-constrained.
- Maintenance list queries are authorized for the tenant/landlord owner of each request.
- Maintenance landlord updates are field-constrained; identity/reference/creation fields cannot be rewritten.
- Tenant maintenance attachment patching is explicitly allowed only for the initial submitted request and only for photos/video fields.
- Maintenance timeline events require the correct actor relationship.
- Maintenance assignment creation verifies the parent request belongs to the assigning landlord/agent.
- Maintenance schedule timeline entries now record the actual landlord/agent actor instead of incorrectly using the tenant ID.
- Maintenance property-history queries now include the caller's tenant/landlord ownership constraint and corresponding composite indexes were added.
- Property photo uploads are restricted to the property owner/admin.
- Maintenance photo/video uploads and reads are restricted to the tenant/landlord/admin associated with the request.
- Maintenance reference-number counters can only be incremented by tenants, exactly one at a time.
- Maintenance notification failures no longer make an otherwise successful maintenance submission fail at the UI level.

## Validation performed

- JSON configuration files parse successfully.
- Modified rules files have balanced delimiters.
- Modified TypeScript/TSX files have balanced delimiters.
- All changed maintenance-history and scheduling call sites were updated.
- A clean `npm ci` was attempted but the sandbox dependency download timed out; an offline install also could not complete because the npm cache did not contain all packages. Therefore a full TypeScript/Expo build could not be honestly reported as passed in this environment.

## Still intentionally deferred

- Cloud Functions for trusted notification fan-out and server-side push delivery.
- Real payment processing.
- Full-text search.
- Map view.
- Full device/emulator acceptance testing.
