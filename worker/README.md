# ZedBookIt R2 upload Worker

Issues short-lived presigned **PUT** URLs for Cloudflare R2. The Expo app calls
it, then uploads straight to R2. No R2 credentials ever reach the app.

```
POST /v1/uploads/sign
Authorization: Bearer <Firebase ID token>
{ "kind": "property-photo" | "maintenance-photo" | "maintenance-video" | "profile-photo",
  "ownerId": "<propertyId | maintenanceId | userId>",
  "index": 0, "contentType": "image/jpeg", "size": 123456 }
→ { "uploadUrl": "...", "key": "properties/<id>/photos/photo-<ts>-0.jpg", "method": "PUT",
    "headers": { "Content-Type": "image/jpeg" }, "expiresIn": 300 }
```

What the Worker enforces
- Valid Firebase ID token (RS256 signature vs Google's public keys, `aud`, `iss`, `exp`, `iat`, `sub`).
- Same authorization as the old `storage.rules` (owner landlord/agent for property photos; tenant or landlord of the request for maintenance media; own profile only; admins anywhere). Ownership is checked by reading Firestore **with the caller's own ID token**, so Firestore rules decide what is visible and no service account is needed.
- Object key is built server-side from validated parts. The client cannot choose a key.
- Content type allowlist (images: jpeg/png/webp; video: mp4/quicktime), max 8 MB images / 60 MB video. `Content-Type` and `Content-Length` are part of the signature.
- URL lifetime: 5 minutes.

## Setup

1. **R2 bucket**: Cloudflare dashboard → R2 → create a bucket.
2. **Public access**: attach a custom domain (recommended) or enable the `r2.dev` URL for development. This base URL becomes `EXPO_PUBLIC_R2_PUBLIC_URL`.
3. **R2 API token**: R2 → Manage R2 API Tokens → create a token with *Object Read & Write*, scoped to that one bucket. Note the Access Key ID and Secret Access Key.
4. **Configure the Worker** in `wrangler.toml`: set `R2_ACCOUNT_ID` and `R2_BUCKET` (and `FIREBASE_PROJECT_ID` if it isn't `zedbookit`). Add `ALLOWED_ORIGINS` only if you use Expo Web.
5. **Secrets** (server-side only):
   ```
   cd worker
   npm install
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler deploy
   ```
6. **App `.env`**: set `EXPO_PUBLIC_R2_UPLOAD_ENDPOINT` (the deployed Worker URL) and `EXPO_PUBLIC_R2_PUBLIC_URL`.
7. **Expo Web only**: add a CORS rule on the bucket allowing `PUT` from your web origin with header `Content-Type`.
8. Recommended: add a Cloudflare rate-limiting rule on the Worker route.

## Tests

`npm test` (Node 18+): verifies the SigV4 signer against AWS's published example vector, token verification, authorization, and input validation.
