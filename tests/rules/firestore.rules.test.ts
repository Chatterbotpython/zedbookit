/**
 * Firestore security-rules tests. REQUIRE the Firestore emulator (Java + firebase-tools):
 *   npx firebase-tools emulators:exec --only firestore --project demo-zedbookit \
 *     "npx vitest run --config vitest.rules.config.ts"
 * They were NOT executed in the environment where this suite was written (no emulator
 * download access) — run them before deploying rules.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-zedbookit",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env.cleanup());

const PROPERTY = { landlordId: "landlord1", status: "approved", title: "T", currency: "ZMW", isVerified: true };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [["tenant1", "tenant"], ["tenant2", "tenant"], ["landlord1", "landlord"], ["landlord2", "landlord"], ["admin1", "admin"]] as const) {
      await setDoc(doc(db, "users", uid), { role, firstName: uid, lastName: "x", email: `${uid}@x.zm`, isSuspended: false });
    }
    await setDoc(doc(db, "properties", "prop1"), PROPERTY);
    await setDoc(doc(db, "properties", "pending1"), { ...PROPERTY, status: "pending" });
  });
});

const viewing = (over: Record<string, unknown> = {}) => ({
  propertyId: "prop1", tenantId: "tenant1", landlordId: "landlord1", requestedDate: "2026-10-05", requestedTime: "14:00",
  status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const vid = "tenant1_prop1_2026-10-05_1400";

describe("users: registration / profile completion", () => {
  const base = (over: Record<string, unknown> = {}) => ({
    role: "tenant", firstName: "A", lastName: "B", email: "new1@x.zm", isSuspended: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
  });
  const newUser = () => env.authenticatedContext("new1", { email: "New1@X.zm" }).firestore();
  it("a new tenant can create their own profile (email must match their login, case-insensitive)", async () => {
    await assertSucceeds(setDoc(doc(newUser(), "users", "new1"), base()));
  });
  it("a new landlord can create their own profile", async () => {
    const db = env.authenticatedContext("new2", { email: "new2@x.zm" }).firestore();
    await assertSucceeds(setDoc(doc(db, "users", "new2"), base({ role: "landlord", email: "new2@x.zm" })));
  });
  it("a profile with optional phone is accepted", async () => {
    const db = env.authenticatedContext("new3", { email: "new3@x.zm" }).firestore();
    await assertSucceeds(setDoc(doc(db, "users", "new3"), base({ email: "new3@x.zm", phone: "+260971234567" })));
  });
  it("rejects self-made admin/agent, a different uid, someone else's email, extra fields", async () => {
    await assertFails(setDoc(doc(newUser(), "users", "new1"), base({ role: "admin" })));
    await assertFails(setDoc(doc(newUser(), "users", "new1"), base({ role: "agent" })));
    await assertFails(setDoc(doc(newUser(), "users", "tenant1"), base()));
    await assertFails(setDoc(doc(newUser(), "users", "new1"), base({ email: "ceo@bank.zm" })));
    await assertFails(setDoc(doc(newUser(), "users", "new1"), base({ isVerified: true })));
  });
  it("an existing profile can't be overwritten through the create path to change its role", async () => {
    const t1 = env.authenticatedContext("tenant1", { email: "tenant1@x.zm" }).firestore();
    await assertFails(setDoc(doc(t1, "users", "tenant1"), base({ role: "landlord", email: "tenant1@x.zm" })));
  });
});

describe("users", () => {
  it("cannot escalate own role or un-suspend", async () => {
    const db = env.authenticatedContext("tenant1").firestore();
    await assertFails(updateDoc(doc(db, "users", "tenant1"), { role: "admin" }));
    await assertFails(updateDoc(doc(db, "users", "tenant1"), { isSuspended: false, role: "landlord" }));
    await assertFails(updateDoc(doc(db, "users", "tenant1"), { email: "someoneelse@x.zm" }));
    await assertSucceeds(updateDoc(doc(db, "users", "tenant1"), { firstName: "New" }));
  });
  it("cannot read someone else's profile", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("tenant2").firestore(), "users", "tenant1")));
    await assertSucceeds(getDoc(doc(env.authenticatedContext("tenant1").firestore(), "users", "tenant1")));
  });
});

/** Creates request + lock atomically, exactly like the client does. */
async function createRequest(uid: string, id: string, data: Record<string, unknown>, propertyId = "prop1") {
  const db = env.authenticatedContext(uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "viewingRequests", id), data);
  batch.set(doc(db, "viewingLocks", `${uid}_${propertyId}`), {
    tenantId: uid, landlordId: (data as { landlordId: string }).landlordId, propertyId, requestId: id, createdAt: serverTimestamp(),
  });
  return batch.commit();
}
async function seedRequest(status = "pending") {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "viewingRequests", vid), { ...viewing(), status, createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, "viewingLocks", "tenant1_prop1"), { tenantId: "tenant1", landlordId: "landlord1", propertyId: "prop1", requestId: vid, createdAt: new Date() });
  });
}
/** Status change + lock release in one batch (what the client does for terminal states). */
async function transition(uid: string, to: string, releaseLock = true) {
  const db = env.authenticatedContext(uid).firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "viewingRequests", vid), { status: to, updatedAt: serverTimestamp() });
  if (releaseLock) batch.delete(doc(db, "viewingLocks", "tenant1_prop1"));
  return batch.commit();
}

describe("viewing requests", () => {
  it("tenant can create a request (with its lock) for an approved property", async () => {
    await assertSucceeds(createRequest("tenant1", vid, viewing()));
  });
  it("rejects a request written WITHOUT its lock document", async () => {
    await assertFails(setDoc(doc(env.authenticatedContext("tenant1").firestore(), "viewingRequests", vid), viewing()));
  });
  it("id must be bound to the payload (date/time), retry suffix allowed", async () => {
    await assertFails(createRequest("tenant1", "tenant1_prop1_2026-10-06_1400", viewing()));
    await assertFails(createRequest("tenant1", "tenant1_prop1_2026-10-05_1030", viewing()));
    await assertFails(createRequest("tenant1", `${vid}_anything-goes`, viewing()));
    await assertFails(createRequest("tenant1", "random-id", viewing()));
    await assertSucceeds(createRequest("tenant1", `${vid}_2`, viewing()));
  });
  it("only ONE active request per tenant per property (second slot is refused while the first is active)", async () => {
    await assertSucceeds(createRequest("tenant1", vid, viewing()));
    await assertFails(createRequest("tenant1", "tenant1_prop1_2026-10-06_0900", viewing({ requestedDate: "2026-10-06", requestedTime: "09:00" })));
  });
  it("after the first request is cancelled (lock released) the tenant can request again", async () => {
    await seedRequest("pending");
    await assertSucceeds(transition("tenant1", "cancelled"));
    await assertSucceeds(createRequest("tenant1", "tenant1_prop1_2026-10-06_0900", viewing({ requestedDate: "2026-10-06", requestedTime: "09:00" })));
  });
  it("rejects: other tenant id, wrong landlord, non-approved property, bad slot, extra field, wrong status, landlord role, signed-out", async () => {
    await assertFails(createRequest("tenant1", vid, viewing({ tenantId: "tenant2" })));
    await assertFails(createRequest("tenant1", vid, viewing({ landlordId: "landlord2" })));
    await assertFails(createRequest("tenant1", "tenant1_pending1_2026-10-05_1400", viewing({ propertyId: "pending1" }), "pending1"));
    await assertFails(createRequest("tenant1", vid, viewing({ requestedTime: "13:37" })));
    await assertFails(createRequest("tenant1", vid, viewing({ isAdmin: true })));
    await assertFails(createRequest("tenant1", vid, viewing({ status: "accepted" })));
    await assertFails(createRequest("landlord2", "landlord2_prop1_2026-10-05_1400", viewing({ tenantId: "landlord2" })));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "viewingRequests", vid), viewing()));
  });
  it("cannot fabricate a lock for someone else or without a request", async () => {
    const t1 = env.authenticatedContext("tenant1").firestore();
    await assertFails(setDoc(doc(t1, "viewingLocks", "tenant1_prop1"), { tenantId: "tenant1", landlordId: "landlord1", propertyId: "prop1", requestId: vid, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(t1, "viewingLocks", "tenant2_prop1"), { tenantId: "tenant2", landlordId: "landlord1", propertyId: "prop1", requestId: vid, createdAt: serverTimestamp() }));
  });
  it("state machine enforced server-side", async () => {
    await seedRequest("pending");
    const ref = (uid: string) => doc(env.authenticatedContext(uid).firestore(), "viewingRequests", vid);
    await assertFails(updateDoc(ref("tenant1"), { status: "accepted", updatedAt: serverTimestamp() })); // tenant can't accept
    await assertFails(updateDoc(ref("landlord2"), { status: "accepted", updatedAt: serverTimestamp() })); // wrong landlord
    await assertFails(updateDoc(ref("landlord1"), { status: "completed", updatedAt: serverTimestamp() })); // pending -> completed
    await assertFails(updateDoc(ref("landlord1"), { status: "accepted", tenantId: "tenant2", updatedAt: serverTimestamp() })); // identity change
    await assertSucceeds(updateDoc(ref("landlord1"), { status: "accepted", updatedAt: serverTimestamp() })); // lock stays: still active
  });
  it("terminal transitions must release the lock in the same write", async () => {
    await seedRequest("accepted");
    await assertFails(transition("landlord1", "completed", false)); // lock left behind
    await assertSucceeds(transition("landlord1", "completed"));
  });
  it("accepted viewings can be cancelled by the tenant OR the landlord, never by others", async () => {
    await seedRequest("accepted");
    await assertFails(transition("tenant2", "cancelled"));
    await assertFails(transition("landlord2", "cancelled"));
    await assertSucceeds(transition("tenant1", "cancelled"));
    await seedRequest("accepted");
    await assertSucceeds(transition("landlord1", "cancelled"));
  });
  it("declined / cancelled / completed are final", async () => {
    for (const status of ["declined", "cancelled", "completed"]) {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "users", "tenant1"), { role: "tenant", isSuspended: false });
        await setDoc(doc(db, "users", "landlord1"), { role: "landlord", isSuspended: false });
        await setDoc(doc(db, "properties", "prop1"), PROPERTY);
        await setDoc(doc(db, "viewingRequests", vid), { ...viewing(), status, createdAt: new Date(), updatedAt: new Date() });
      });
      const t = env.authenticatedContext("tenant1").firestore();
      const l = env.authenticatedContext("landlord1").firestore();
      await assertFails(updateDoc(doc(t, "viewingRequests", vid), { status: "cancelled", updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(l, "viewingRequests", vid), { status: "accepted", updatedAt: serverTimestamp() }));
    }
  });
  it("other tenants can't read or cancel someone else's request", async () => {
    await seedRequest("pending");
    await assertFails(getDoc(doc(env.authenticatedContext("tenant2").firestore(), "viewingRequests", vid)));
    await assertFails(transition("tenant2", "cancelled"));
  });
});

describe("notifications", () => {
  const note = (over: Record<string, unknown> = {}) => ({
    userId: "landlord1", type: "new_viewing_request", title: "t", body: "b", isRead: false,
    data: { viewingRequestId: vid, propertyId: "prop1" }, createdAt: serverTimestamp(), ...over,
  });
  it("a tenant can notify the landlord of THEIR OWN viewing request", async () => {
    await seedRequest("pending");
    await assertSucceeds(addDoc(collection(env.authenticatedContext("tenant1").firestore(), "notifications"), note()));
  });
  it("rejects spam: unrelated users, unknown types, no reference, other recipients", async () => {
    await seedRequest("pending");
    const t2 = env.authenticatedContext("tenant2").firestore();
    const t1 = env.authenticatedContext("tenant1").firestore();
    await assertFails(addDoc(collection(t2, "notifications"), note()));
    await assertFails(addDoc(collection(t1, "notifications"), note({ type: "account_suspended" })));
    await assertFails(addDoc(collection(t1, "notifications"), note({ data: {} })));
    await assertFails(addDoc(collection(t1, "notifications"), note({ userId: "landlord2" })));
    await assertFails(addDoc(collection(t1, "notifications"), note({ type: "property_approved" })));
  });
});

describe("properties", () => {
  it("public can read approved, not pending; owner can read own pending", async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext("tenant1").firestore(), "properties", "prop1")));
    await assertFails(getDoc(doc(env.authenticatedContext("tenant1").firestore(), "properties", "pending1")));
    await assertSucceeds(getDoc(doc(env.authenticatedContext("landlord1").firestore(), "properties", "pending1")));
  });
  it("landlords cannot self-approve, verify, or edit others' listings", async () => {
    const l1 = env.authenticatedContext("landlord1").firestore();
    await assertFails(updateDoc(doc(l1, "properties", "pending1"), { status: "approved", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(l1, "properties", "prop1"), { isVerified: false }));
    await assertFails(updateDoc(doc(env.authenticatedContext("landlord2").firestore(), "properties", "prop1"), { title: "hijack", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(env.authenticatedContext("admin1").firestore(), "properties", "pending1"), { status: "approved" }));
  });
  it("landlord cannot change content of an approved listing without re-review, and cannot un-suspend", async () => {
    const l1 = env.authenticatedContext("landlord1").firestore();
    await assertFails(updateDoc(doc(l1, "properties", "prop1"), { title: "New title", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(l1, "properties", "prop1"), { price: 4000, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(l1, "properties", "prop1"), { title: "New title", status: "pending", updatedAt: serverTimestamp() }));
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "properties", "susp1"), { ...PROPERTY, status: "suspended" }));
    await assertFails(updateDoc(doc(l1, "properties", "susp1"), { status: "inactive", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(l1, "properties", "susp1"), { status: "pending", updatedAt: serverTimestamp() }));
  });
  it("owners cannot inflate their own viewCount", async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext("landlord1").firestore(), "properties", "prop1"), { viewCount: 1 }));
  });
  it("savedCount cannot be changed without a matching favorite doc", async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext("tenant1").firestore(), "properties", "prop1"), { savedCount: 1 }));
  });
});

// ---------------------------------------------------------------------------------------
// Five-change pass: multiple pending listings, vacant/sold, >10 photos, free viewing times,
// tenant name on conversations.
// ---------------------------------------------------------------------------------------
async function seedProperty(id: string, over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "properties", id), { ...PROPERTY, ...over }));
}
const newListing = (over: Record<string, unknown> = {}) => ({
  landlordId: "landlord1", status: "pending", isVerified: false, currency: "ZMW", title: "New listing",
  photos: [], viewCount: 0, savedCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const photoUrls = (n: number) => Array.from({ length: n }, (_, i) => `https://pub.r2.dev/properties/p/${i}.jpg`);
const asLandlord1 = () => env.authenticatedContext("landlord1").firestore();

describe("1. a landlord can have many pending properties", () => {
  it("landlord creates property A (pending) and then property B (pending) - not blocked", async () => {
    const col = collection(asLandlord1(), "properties");
    await assertSucceeds(addDoc(col, newListing({ title: "Property A" })));
    await assertSucceeds(addDoc(col, newListing({ title: "Property B" })));
    await assertSucceeds(addDoc(col, newListing({ title: "Property C" })));
  });
  it("another landlord's pending listings coexist and stay independent", async () => {
    const l2 = env.authenticatedContext("landlord2").firestore();
    await assertSucceeds(addDoc(collection(l2, "properties"), newListing({ landlordId: "landlord2" })));
    await assertSucceeds(addDoc(collection(asLandlord1(), "properties"), newListing()));
  });
  it("ownership/verification rules still hold: no approved/verified/other-owner creates", async () => {
    const col = collection(asLandlord1(), "properties");
    await assertFails(addDoc(col, newListing({ status: "approved" })));
    await assertFails(addDoc(col, newListing({ status: "vacant" })));
    await assertFails(addDoc(col, newListing({ isVerified: true })));
    await assertFails(addDoc(col, newListing({ landlordId: "landlord2" })));
    await assertFails(addDoc(collection(env.authenticatedContext("tenant1").firestore(), "properties"), newListing({ landlordId: "tenant1" })));
  });
  it("each pending property is edited independently (photos attach to the right one)", async () => {
    const col = collection(asLandlord1(), "properties");
    const a = await addDoc(col, newListing({ title: "A" }));
    const b = await addDoc(col, newListing({ title: "B" }));
    await assertSucceeds(updateDoc(a, { photos: photoUrls(2), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(b, { photos: photoUrls(3), updatedAt: serverTimestamp() }));
  });
});

describe("2. vacant / rented / sold", () => {
  const setStatus = (uid: string, id: string, status: string) =>
    updateDoc(doc(env.authenticatedContext(uid).firestore(), "properties", id), { status, updatedAt: serverTimestamp() });

  it("owner can mark an approved property vacant, rented and sold", async () => {
    await assertSucceeds(setStatus("landlord1", "prop1", "vacant"));
    await seedProperty("p2");
    await assertSucceeds(setStatus("landlord1", "p2", "rented"));
    await seedProperty("p3");
    await assertSucceeds(setStatus("landlord1", "p3", "sold"));
  });
  it("owner can move between live statuses (rented -> vacant, vacant -> sold, sold -> vacant)", async () => {
    await seedProperty("r1", { status: "rented" });
    await seedProperty("v1", { status: "vacant" });
    await seedProperty("s1", { status: "sold" });
    await assertSucceeds(setStatus("landlord1", "r1", "vacant"));
    await assertSucceeds(setStatus("landlord1", "v1", "sold"));
    await assertSucceeds(setStatus("landlord1", "s1", "vacant"));
  });
  it("SECURITY: an owner cannot jump into a live status from pending / inactive / rejected / suspended", async () => {
    await seedProperty("in1", { status: "inactive", isVerified: false });
    await seedProperty("rej1", { status: "rejected", isVerified: false });
    await seedProperty("sus1", { status: "suspended" });
    for (const target of ["approved", "vacant", "rented", "sold"]) {
      await assertFails(setStatus("landlord1", "pending1", target));
      await assertFails(setStatus("landlord1", "in1", target));
      await assertFails(setStatus("landlord1", "rej1", target));
      await assertFails(setStatus("landlord1", "sus1", target));
    }
  });
  it("existing transitions still work: pending -> inactive -> pending, approved -> inactive", async () => {
    await assertSucceeds(setStatus("landlord1", "pending1", "inactive"));
    await assertSucceeds(setStatus("landlord1", "pending1", "pending"));
    await assertSucceeds(setStatus("landlord1", "prop1", "inactive"));
  });
  it("live -> live status flips cannot smuggle in content edits (must re-enter review)", async () => {
    const l1 = asLandlord1();
    await assertFails(updateDoc(doc(l1, "properties", "prop1"), { status: "vacant", title: "Bait and switch", updatedAt: serverTimestamp() }));
    await seedProperty("r2", { status: "rented" });
    await assertFails(updateDoc(doc(l1, "properties", "r2"), { title: "Edited while rented", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(l1, "properties", "r2"), { photos: photoUrls(3), updatedAt: serverTimestamp() }));
    await seedProperty("v2", { status: "vacant" });
    await assertSucceeds(updateDoc(doc(l1, "properties", "v2"), { price: 4500, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(l1, "properties", "r2"), { title: "Edited, back to review", status: "pending", updatedAt: serverTimestamp() }));
  });
  it("other landlords, tenants and strangers cannot change or delete someone else's property", async () => {
    await seedProperty("v3", { status: "vacant" });
    for (const uid of ["landlord2", "tenant1"]) {
      await assertFails(setStatus(uid, "v3", "sold"));
      await assertFails(setStatus(uid, "prop1", "rented"));
      await assertFails(deleteDoc(doc(env.authenticatedContext(uid).firestore(), "properties", "v3")));
    }
    await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), "properties", "v3"), { status: "sold" }));
    await assertSucceeds(setStatus("admin1", "v3", "suspended"));
  });
  it("vacant is publicly readable; rented, sold and pending are not (except to the owner)", async () => {
    await seedProperty("v4", { status: "vacant" });
    await seedProperty("r4", { status: "rented" });
    await seedProperty("s4", { status: "sold" });
    const t = env.authenticatedContext("tenant1").firestore();
    await assertSucceeds(getDoc(doc(t, "properties", "v4")));
    await assertFails(getDoc(doc(t, "properties", "r4")));
    await assertFails(getDoc(doc(t, "properties", "s4")));
    await assertSucceeds(getDoc(doc(asLandlord1(), "properties", "s4")));
  });
  it("public discovery query for approved + vacant is allowed; including other statuses is not", async () => {
    await seedProperty("v5", { status: "vacant" });
    const t = env.authenticatedContext("tenant1").firestore();
    const col = collection(t, "properties");
    await assertSucceeds(getDocs(query(col, where("status", "in", ["approved", "vacant"]))));
    await assertSucceeds(getDocs(query(col, where("status", "in", ["approved", "vacant"]), where("location.city", "==", "Lusaka"))));
    await assertFails(getDocs(query(col, where("status", "in", ["approved", "pending"]))));
    await assertFails(getDocs(query(col, where("status", "==", "sold"))));
    await assertFails(getDocs(query(col)));
  });
  it("viewing requests and enquiries are allowed on vacant properties but not rented/sold ones", async () => {
    await seedProperty("v6", { status: "vacant" });
    await seedProperty("r6", { status: "rented" });
    await seedProperty("s6", { status: "sold" });
    await assertSucceeds(createRequest("tenant1", "tenant1_v6_2026-10-05_1400", viewing({ propertyId: "v6" }), "v6"));
    await assertFails(createRequest("tenant1", "tenant1_r6_2026-10-05_1400", viewing({ propertyId: "r6" }), "r6"));
    await assertFails(createRequest("tenant1", "tenant1_s6_2026-10-05_1400", viewing({ propertyId: "s6" }), "s6"));
  });
});

describe("3. more than 10 photos", () => {
  it("a property can hold 25 and 30 photos", async () => {
    await assertSucceeds(updateDoc(doc(asLandlord1(), "properties", "pending1"), { photos: photoUrls(25), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asLandlord1(), "properties", "pending1"), { photos: photoUrls(30), updatedAt: serverTimestamp() }));
  });
  it("more than 30 is rejected on update and on create", async () => {
    await assertFails(updateDoc(doc(asLandlord1(), "properties", "pending1"), { photos: photoUrls(31), updatedAt: serverTimestamp() }));
    await assertFails(addDoc(collection(asLandlord1(), "properties"), newListing({ photos: photoUrls(31) })));
    await assertSucceeds(addDoc(collection(asLandlord1(), "properties"), newListing({ photos: photoUrls(12) })));
  });
  it("only the owner can change photos", async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext("landlord2").firestore(), "properties", "pending1"), { photos: photoUrls(12), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(env.authenticatedContext("tenant1").firestore(), "properties", "prop1"), { photos: photoUrls(12) }));
  });
});

describe("4. tenants choose their own viewing time", () => {
  const idFor = (time: string, date = "2026-10-05") => `tenant1_prop1_${date}_${time.replace(":", "")}`;
  it("13:15 is accepted (id carries the exact time)", async () => {
    await assertSucceeds(createRequest("tenant1", idFor("13:15"), viewing({ requestedTime: "13:15" })));
  });
  it("08:07 is accepted", async () => {
    await assertSucceeds(createRequest("tenant1", idFor("08:07"), viewing({ requestedTime: "08:07" })));
  });
  it("window edges 06:00 and 20:00 are accepted", async () => {
    await assertSucceeds(createRequest("tenant1", idFor("06:00"), viewing({ requestedTime: "06:00" })));
    await seedProperty("edge2");
    await assertSucceeds(createRequest("tenant1", "tenant1_edge2_2026-10-05_2000", viewing({ propertyId: "edge2", requestedTime: "20:00" }), "edge2"));
  });
  it("invalid or out-of-hours times are rejected", async () => {
    for (const t of ["24:00", "13:60", "5:30", "noon", "05:59", "20:01", "23:30", "00:00", "13:5", "1315", ""]) {
      await assertFails(createRequest("tenant1", idFor(t || "x"), viewing({ requestedTime: t })));
    }
  });
  it("the document id must match the chosen time (no mismatched ids)", async () => {
    await assertFails(createRequest("tenant1", idFor("14:00"), viewing({ requestedTime: "13:15" })));
    await assertFails(createRequest("tenant1", idFor("13:15"), viewing({ requestedTime: "13:16" })));
  });
  it("duplicate-request protection still holds for custom times (one active request per property)", async () => {
    await assertSucceeds(createRequest("tenant1", idFor("13:15"), viewing({ requestedTime: "13:15" })));
    await assertFails(createRequest("tenant1", idFor("15:45"), viewing({ requestedTime: "15:45" })));
  });
  it("other users still cannot create requests for a tenant or touch someone else's request", async () => {
    await assertFails(createRequest("tenant2", idFor("13:15"), viewing({ requestedTime: "13:15" })));
    await seedRequest("pending");
    await assertFails(transition("tenant2", "cancelled"));
    await assertFails(transition("landlord2", "accepted"));
  });
});

describe("5. tenant name on property-enquiry conversations", () => {
  const cid = "enquiry_prop1_tenant1_landlord1";
  const convo = (over: Record<string, unknown> = {}) => ({
    context: "property_enquiry", propertyId: "prop1", participantIds: ["tenant1", "landlord1"],
    lastMessage: "Hello", lastMessageAt: serverTimestamp(), ...over,
  });
  const seedConvo = async (over: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "conversations", cid), { ...convo({ lastMessageAt: new Date() }), ...over }));
  const t1 = () => env.authenticatedContext("tenant1").firestore();

  it("a tenant starts an enquiry and the name is stored on it", async () => {
    await assertSucceeds(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: "Mwansa Banda" })));
  });
  it("an enquiry without a name is still allowed (older clients)", async () => {
    await assertSucceeds(setDoc(doc(t1(), "conversations", cid), convo()));
  });
  it("name length is capped and unknown fields (e.g. email/phone) are rejected", async () => {
    await assertFails(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: "x".repeat(81) })));
    await assertFails(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: 42 })));
    await assertFails(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: "A B", tenantEmail: "a@b.zm" })));
    await assertFails(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: "A B", tenantPhone: "+260971234567" })));
  });
  it("the tenant can add their name to an older conversation that has none (backfill)", async () => {
    await seedConvo();
    await assertSucceeds(setDoc(doc(t1(), "conversations", cid), convo({ tenantName: "Mwansa Banda" }), { merge: true }));
  });
  it("the landlord can reply (last message) but can never set or change the tenant name", async () => {
    await seedConvo({ tenantName: "Mwansa Banda" });
    const l1 = asLandlord1();
    await assertSucceeds(setDoc(doc(l1, "conversations", cid), convo({ lastMessage: "Hi, it's available" }), { merge: true }));
    await assertSucceeds(updateDoc(doc(l1, "conversations", cid), { lastMessage: "Viewing at 3?", lastMessageAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(l1, "conversations", cid), { tenantName: "Somebody Else" }));
    await assertFails(setDoc(doc(l1, "conversations", cid), convo({ tenantName: "Somebody Else" }), { merge: true }));
  });
  it("participants cannot be rewritten and strangers can neither read nor change the thread", async () => {
    await seedConvo({ tenantName: "Mwansa Banda" });
    await assertFails(updateDoc(doc(t1(), "conversations", cid), { participantIds: ["tenant1", "landlord2"] }));
    for (const uid of ["tenant2", "landlord2"]) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, "conversations", cid)));
      await assertFails(updateDoc(doc(db, "conversations", cid), { tenantName: "Hacked" }));
    }
    await assertSucceeds(getDoc(doc(asLandlord1(), "conversations", cid)));
  });
  it("enquiries cannot be opened on rented/sold properties or on someone else's behalf", async () => {
    await seedProperty("r9", { status: "rented" });
    await assertFails(setDoc(doc(t1(), "conversations", "enquiry_r9_tenant1_landlord1"), convo({ propertyId: "r9" })));
    await assertFails(setDoc(doc(env.authenticatedContext("tenant2").firestore(), "conversations", cid), convo()));
  });
});
