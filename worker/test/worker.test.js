import test from "node:test";
import assert from "node:assert/strict";
import worker, { presignUrl, verifyFirebaseIdToken } from "../src/index.js";

// ---- 1. SigV4 presigner against AWS's documented example vector -------------
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
test("presignUrl matches the AWS SigV4 query-auth example", async () => {
  const url = await presignUrl({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "s3",
    expires: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});

// ---- helpers: fake Firebase token issuer + fake Google/Firestore fetch -------
const PROJECT = "zedbookit";
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };

const b64u = (b) => Buffer.from(b).toString("base64url");
async function makeToken(overrides = {}, kid = "test-kid") {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid, typ: "JWT" };
  const payload = {
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
    sub: "landlord1", iat: now - 10, exp: now + 3600, auth_time: now - 10, ...overrides,
  };
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64u(sig)}`;
}

// Firestore data keyed by "collection/id"; access is emulated per-caller in the mock.
const DB = {
  "users/landlord1": { role: "landlord" },
  "users/landlord2": { role: "landlord" },
  "users/tenant1": { role: "tenant" },
  "users/admin1": { role: "admin" },
  "properties/prop1": { landlordId: "landlord1", status: "pending" },
  "maintenanceRequests/m1": { tenantId: "tenant1", landlordId: "landlord1" },
};
function makeFetch() {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://www.googleapis.com/service_accounts")) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    const m = /documents\/([^/]+)\/([^/?]+)$/.exec(String(url));
    assert.ok(m, `unexpected fetch ${url}`);
    // Emulate Firestore rules, using the caller's token (sub claim) as request.auth.
    const token = init.headers.Authorization.replace("Bearer ", "");
    const uid = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
    const [, col, id] = m;
    const doc = DB[`${col}/${id}`];
    if (!doc) return new Response("{}", { status: 404 });
    const isAdmin = DB[`users/${uid}`]?.role === "admin";
    let allowed = isAdmin;
    if (col === "users") allowed ||= id === uid;
    if (col === "properties") allowed ||= doc.landlordId === uid || doc.status === "approved";
    if (col === "maintenanceRequests") allowed ||= doc.tenantId === uid || doc.landlordId === uid;
    if (!allowed) return new Response("{}", { status: 403 });
    const fields = Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, { stringValue: v }]));
    return new Response(JSON.stringify({ fields }), { status: 200 });
  };
  f.calls = calls;
  return f;
}

const ENV = {
  FIREBASE_PROJECT_ID: PROJECT, R2_ACCOUNT_ID: "acct123", R2_BUCKET: "zed-bucket",
  R2_ACCESS_KEY_ID: "AKID", R2_SECRET_ACCESS_KEY: "SECRET", ALLOWED_ORIGINS: "http://localhost:8081",
};
async function sign(body, { token, env = ENV, fetchImpl = makeFetch(), method = "POST", path = "/v1/uploads/sign", headers = {} } = {}) {
  const req = new Request(`https://w.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, env, {}, fetchImpl);
  return { res, json: await res.json().catch(() => null) };
}
const base = { kind: "property-photo", ownerId: "prop1", index: 2, contentType: "image/jpeg", size: 500_000 };

// ---- 2. token verification ---------------------------------------------------
test("accepts a valid token, rejects bad ones", async () => {
  const f = makeFetch();
  assert.equal(await verifyFirebaseIdToken(await makeToken(), PROJECT, f), "landlord1");
  await assert.rejects(verifyFirebaseIdToken(await makeToken({ aud: "other" }), PROJECT, f), /audience/);
  await assert.rejects(verifyFirebaseIdToken(await makeToken({ iss: "https://evil" }), PROJECT, f), /issuer/);
  await assert.rejects(verifyFirebaseIdToken(await makeToken({ exp: 1 }), PROJECT, f), /expired/);
  await assert.rejects(verifyFirebaseIdToken(await makeToken({ sub: "" }), PROJECT, f), /subject/);
  await assert.rejects(verifyFirebaseIdToken(await makeToken({}, "nope"), PROJECT, f), /Unknown token signing key/);
  const t = await makeToken();
  const [h, p, s] = t.split(".");
  const forged = `${h}.${b64u(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), sub: "admin1" }))}.${s}`;
  await assert.rejects(verifyFirebaseIdToken(forged, PROJECT, f), /signature/);
  await assert.rejects(verifyFirebaseIdToken("a.b", PROJECT, f), /Malformed/);
});

// ---- 3. endpoint behaviour ---------------------------------------------------
test("anonymous / garbage auth is rejected", async () => {
  assert.equal((await sign(base)).res.status, 401);
  assert.equal((await sign(base, { token: "garbage.token.here" })).res.status, 401);
});

test("owner landlord gets a presigned URL with a server-generated key", async () => {
  const { res, json } = await sign(base, { token: await makeToken() });
  assert.equal(res.status, 200);
  assert.match(json.key, /^properties\/prop1\/photos\/photo-\d+-2\.jpg$/);
  const u = new URL(json.uploadUrl);
  assert.equal(u.host, "acct123.r2.cloudflarestorage.com");
  assert.equal(u.pathname, `/zed-bucket/${json.key}`);
  assert.equal(u.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(u.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
  assert.ok(!json.uploadUrl.includes("SECRET"));
});

test("other landlord, tenant, and unknown property are forbidden", async () => {
  assert.equal((await sign(base, { token: await makeToken({ sub: "landlord2" }) })).res.status, 403);
  assert.equal((await sign(base, { token: await makeToken({ sub: "tenant1" }) })).res.status, 403);
  assert.equal((await sign({ ...base, ownerId: "missing" }, { token: await makeToken() })).res.status, 403);
});

test("admin may upload to any property", async () => {
  assert.equal((await sign(base, { token: await makeToken({ sub: "admin1" }) })).res.status, 200);
});

test("maintenance: tenant + landlord of the request allowed, others not", async () => {
  const m = { kind: "maintenance-photo", ownerId: "m1", index: 0, contentType: "image/jpeg", size: 1000 };
  const t = await sign(m, { token: await makeToken({ sub: "tenant1" }) });
  assert.equal(t.res.status, 200);
  assert.match(t.json.key, /^maintenance\/m1\/photos\/photo-\d+-0\.jpg$/);
  assert.equal((await sign(m, { token: await makeToken({ sub: "landlord1" }) })).res.status, 200);
  assert.equal((await sign(m, { token: await makeToken({ sub: "landlord2" }) })).res.status, 403);
});

test("maintenance video: allowed types/size, key under videos/", async () => {
  const v = { kind: "maintenance-video", ownerId: "m1", contentType: "video/mp4", size: 30 * 1024 * 1024 };
  const ok = await sign(v, { token: await makeToken({ sub: "tenant1" }) });
  assert.equal(ok.res.status, 200);
  assert.match(ok.json.key, /^maintenance\/m1\/videos\/video-\d+-0\.mp4$/);
  assert.equal((await sign({ ...v, size: 61 * 1024 * 1024 }, { token: await makeToken({ sub: "tenant1" }) })).res.status, 413);
  assert.equal((await sign({ ...v, contentType: "image/jpeg" }, { token: await makeToken({ sub: "tenant1" }) })).res.status, 415);
});

test("profile photo: own only (admin excepted)", async () => {
  const p = { kind: "profile-photo", ownerId: "tenant1", contentType: "image/jpeg", size: 1000 };
  const own = await sign(p, { token: await makeToken({ sub: "tenant1" }) });
  assert.equal(own.res.status, 200);
  assert.match(own.json.key, /^users\/tenant1\/profile\/avatar-\d+-0\.jpg$/);
  assert.equal((await sign(p, { token: await makeToken({ sub: "landlord1" }) })).res.status, 403);
  assert.equal((await sign(p, { token: await makeToken({ sub: "admin1" }) })).res.status, 200);
});

test("a property can have 30 photos: indexes 0-29 all get unique keys (previous app cap was 10)", async () => {
  const tok = await makeToken();
  const keys = new Set();
  for (let index = 0; index < 30; index++) {
    const { res, json } = await sign({ ...base, index }, { token: tok });
    assert.equal(res.status, 200, `index ${index}`);
    assert.match(json.key, new RegExp(`^properties/prop1/photos/photo-\\d+-${index}\\.jpg$`));
    keys.add(json.key);
  }
  assert.equal(keys.size, 30);
  assert.equal((await sign({ ...base, index: 100 }, { token: tok })).res.status, 400);
});

test("input validation: path traversal, kinds, types, sizes, client keys ignored", async () => {
  const tok = await makeToken();
  for (const ownerId of ["../x", "a/b", "prop1/../../users/x", "", "a b", "x".repeat(200)]) {
    assert.equal((await sign({ ...base, ownerId }, { token: tok })).res.status, 400, ownerId);
  }
  assert.equal((await sign({ ...base, kind: "anything" }, { token: tok })).res.status, 400);
  assert.equal((await sign({ ...base, contentType: "text/html" }, { token: tok })).res.status, 415);
  assert.equal((await sign({ ...base, contentType: "image/svg+xml" }, { token: tok })).res.status, 415);
  assert.equal((await sign({ ...base, size: 9 * 1024 * 1024 }, { token: tok })).res.status, 413);
  assert.equal((await sign({ ...base, size: 0 }, { token: tok })).res.status, 400);
  assert.equal((await sign({ ...base, size: "10" }, { token: tok })).res.status, 400);
  assert.equal((await sign({ ...base, index: -1 }, { token: tok })).res.status, 400);
  assert.equal((await sign({ ...base, index: 1.5 }, { token: tok })).res.status, 400);
  const { json } = await sign({ ...base, key: "users/victim/profile/x.jpg", path: "../../etc" }, { token: tok });
  assert.match(json.key, /^properties\/prop1\/photos\//);
});

test("misconfigured worker, routing, CORS", async () => {
  const tok = await makeToken();
  assert.equal((await sign(base, { token: tok, env: { ...ENV, R2_SECRET_ACCESS_KEY: undefined } })).res.status, 500);
  assert.equal((await sign(base, { token: tok, env: { ...ENV, R2_BUCKET: "" } })).res.status, 500);
  assert.equal((await sign(base, { token: tok, path: "/other" })).res.status, 404);
  assert.equal((await sign(null, { token: tok, method: "GET" })).res.status, 405);
  const allowed = await sign(base, { token: tok, headers: { Origin: "http://localhost:8081" } });
  assert.equal(allowed.res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8081");
  const denied = await sign(base, { token: tok, headers: { Origin: "https://evil.example" } });
  assert.equal(denied.res.headers.get("Access-Control-Allow-Origin"), null);
});
