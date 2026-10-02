/**
 * ZedBookIt R2 upload signer (Cloudflare Worker, no dependencies).
 *
 *   POST /v1/uploads/sign
 *   Authorization: Bearer <Firebase ID token>
 *   { kind, ownerId, index?, contentType, size }
 *
 * Verifies the Firebase ID token, checks that the caller is allowed to write to
 * the requested resource (same rules as the old storage.rules), generates the
 * object key SERVER-SIDE, and returns a short-lived presigned R2 PUT URL.
 *
 * R2 credentials exist only as Worker secrets. The app never sees them.
 */

// ---------------------------------------------------------------- config ----

const URL_TTL_SECONDS = 300;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // matches old storage.rules
const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // matches old storage.rules
const MAX_INDEX = 99;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// Sign Content-Length so R2 rejects uploads larger than what we approved.
// If R2 ever rejects uploads with SignatureDoesNotMatch because of this,
// set to false (size is then only checked at signing time).
const SIGN_CONTENT_LENGTH = true;

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov" };

/** kind -> how the object key is built and what may be uploaded. */
const KINDS = {
  "property-photo": {
    types: IMAGE_TYPES,
    max: MAX_IMAGE_BYTES,
    prefix: "photo",
    dir: (id) => `properties/${id}/photos`,
  },
  "maintenance-photo": {
    types: IMAGE_TYPES,
    max: MAX_IMAGE_BYTES,
    prefix: "photo",
    dir: (id) => `maintenance/${id}/photos`,
  },
  "maintenance-video": {
    types: VIDEO_TYPES,
    max: MAX_VIDEO_BYTES,
    prefix: "video",
    dir: (id) => `maintenance/${id}/videos`,
  },
  "profile-photo": {
    types: IMAGE_TYPES,
    max: MAX_IMAGE_BYTES,
    prefix: "avatar",
    dir: (id) => `users/${id}/profile`,
  },
};

// ------------------------------------------------------------- utilities ----

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const encoder = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", k, encoder.encode(data));
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

/** RFC 3986 encoding as required by SigV4. */
function rfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// ------------------------------------------------- SigV4 query presigning ----

/**
 * Generic SigV4 query-string presigner (path-style, UNSIGNED-PAYLOAD).
 * `signedHeaders` are header values that the client MUST send unchanged.
 */
export async function presignUrl({
  method,
  host,
  path,
  accessKeyId,
  secretAccessKey,
  region,
  service,
  expires,
  signedHeaders = {},
  now = new Date(),
}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const headers = { host, ...signedHeaders };
  const names = Object.keys(headers)
    .map((n) => n.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));

  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": names.join(";"),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join("&");

  const canonicalPath = path
    .split("/")
    .map((seg) => rfc3986(seg))
    .join("/");
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");

  const canonicalRequest = [
    method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ------------------------------------------- Firebase ID token verification ----

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksCache = { keys: /** @type {Record<string, any>} */ ({}), fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 60 * 1000;

async function getSigningKey(kid, fetchImpl) {
  const fresh = Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!(fresh && jwksCache.keys[kid])) {
    // Refetch when stale, or when we see an unknown kid (rate limited).
    if (!fresh || Date.now() - jwksCache.fetchedAt > JWKS_MIN_REFETCH_MS) {
      const res = await fetchImpl(JWKS_URL);
      if (!res.ok) throw new HttpError(503, "Could not load Firebase signing keys");
      const body = await res.json();
      const keys = {};
      for (const jwk of body.keys ?? []) keys[jwk.kid] = jwk;
      jwksCache = { keys, fetchedAt: Date.now() };
    }
  }
  const jwk = jwksCache.keys[kid];
  if (!jwk) throw new HttpError(401, "Unknown token signing key");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

/** Returns the verified Firebase UID or throws HttpError(401). */
export async function verifyFirebaseIdToken(token, projectId, fetchImpl = fetch) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Malformed token");
  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    throw new HttpError(401, "Malformed token");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new HttpError(401, "Invalid token header");

  const key = await getSigningKey(header.kid, fetchImpl);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new HttpError(401, "Invalid token signature");

  const now = Math.floor(Date.now() / 1000);
  const leeway = 60;
  if (payload.aud !== projectId) throw new HttpError(401, "Token audience mismatch");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new HttpError(401, "Token issuer mismatch");
  if (typeof payload.exp !== "number" || payload.exp + leeway < now) throw new HttpError(401, "Token expired");
  if (typeof payload.iat !== "number" || payload.iat - leeway > now) throw new HttpError(401, "Token issued in the future");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new HttpError(401, "Invalid token subject");
  return payload.sub;
}

// ------------------------------------------------------ authorization ----

/**
 * Reads one Firestore document using the CALLER's ID token, so Firestore
 * security rules decide whether the caller may see it. No service account.
 * Returns the flat string fields we care about, or null if not readable.
 */
async function readDoc(env, idToken, collection, id, fetchImpl) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}` +
    `/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new HttpError(502, "Could not verify permissions");
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    if (v && typeof v.stringValue === "string") out[k] = v.stringValue;
  }
  return out;
}

/** Mirrors the write rules of the previous storage.rules. */
async function authorize(env, idToken, uid, kind, ownerId, fetchImpl) {
  const forbidden = () => new HttpError(403, "You are not allowed to upload to this resource");

  if (kind === "profile-photo" && ownerId === uid) return; // own profile, no lookups needed

  const [me, target] = await Promise.all([
    readDoc(env, idToken, "users", uid, fetchImpl),
    kind === "property-photo"
      ? readDoc(env, idToken, "properties", ownerId, fetchImpl)
      : kind === "profile-photo"
        ? Promise.resolve(null)
        : readDoc(env, idToken, "maintenanceRequests", ownerId, fetchImpl),
  ]);
  const role = me?.role;
  if (role === "admin") return;
  const isLandlordOrAgent = role === "landlord" || role === "agent";

  if (kind === "property-photo") {
    if (isLandlordOrAgent && target?.landlordId === uid) return;
  } else if (kind === "maintenance-photo" || kind === "maintenance-video") {
    if (target?.tenantId === uid) return;
    if (isLandlordOrAgent && target?.landlordId === uid) return;
  }
  throw forbidden();
}

// ------------------------------------------------------------- handler ----

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return {};
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

async function handleSign(request, env, fetchImpl) {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.FIREBASE_PROJECT_ID) {
    throw new HttpError(500, "Upload service is not configured");
  }

  const auth = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  if (!match) throw new HttpError(401, "Missing bearer token");
  const idToken = match[1];
  const uid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID, fetchImpl);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  const spec = KINDS[body?.kind];
  if (!spec) throw new HttpError(400, "Unsupported upload kind");
  if (typeof body.ownerId !== "string" || !ID_PATTERN.test(body.ownerId)) throw new HttpError(400, "Invalid ownerId");
  const index = body.index === undefined ? 0 : body.index;
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw new HttpError(400, "Invalid index");
  const ext = typeof body.contentType === "string" ? spec.types[body.contentType] : undefined;
  if (!ext) throw new HttpError(415, "Unsupported content type for this upload");
  const size = body.size;
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, "Invalid size");
  if (size > spec.max) throw new HttpError(413, `File too large (max ${Math.floor(spec.max / 1024 / 1024)} MB)`);

  await authorize(env, idToken, uid, body.kind, body.ownerId, fetchImpl);

  // The key is built here from validated parts only; the client never supplies one.
  const key = `${spec.dir(body.ownerId)}/${spec.prefix}-${Date.now()}-${index}.${ext}`;

  const signedHeaders = { "Content-Type": body.contentType };
  if (SIGN_CONTENT_LENGTH) signedHeaders["Content-Length"] = String(size);

  const uploadUrl = await presignUrl({
    method: "PUT",
    host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${env.R2_BUCKET}/${key}`,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
    expires: URL_TTL_SECONDS,
    signedHeaders,
  });

  return { uploadUrl, key, method: "PUT", headers: { "Content-Type": body.contentType }, expiresIn: URL_TTL_SECONDS };
}

export default {
  async fetch(request, env, _ctx, fetchImpl = fetch) {
    const cors = corsHeaders(request, env);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (pathname !== "/v1/uploads/sign") return json(404, { error: "Not found" }, cors);
    if (request.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

    try {
      return json(200, await handleSign(request, env, fetchImpl), cors);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message }, cors);
      console.error("upload-sign failed", err);
      return json(500, { error: "Internal error" }, cors);
    }
  },
};
