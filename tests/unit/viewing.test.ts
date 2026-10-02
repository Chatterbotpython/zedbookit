import { describe, expect, it, vi } from "vitest";
import {
  submitViewingRequestWith, transitionViewingRequestWith,
  type SubmitDeps, type TransitionDeps,
} from "@/services/viewingRequests.service";
import {
  buildViewingLockId, buildViewingRequestId, canTransition, formatTimeInput, isValidTimeOfDay, isWithinViewingHours,
  normalizeTimeInput, quickTimesFor, validateViewingSlot,
} from "@/services/viewingRequests.logic";
import { AppError } from "@/services/errors";
import type { Property, ViewingRequest, ViewingRequestStatus } from "@/types";

vi.mock("@/config/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn(() => ({})), doc: vi.fn(), getDocs: vi.fn(), orderBy: vi.fn(), query: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"), setDoc: vi.fn(), updateDoc: vi.fn(), where: vi.fn(), addDoc: vi.fn(),
  limit: vi.fn(), onSnapshot: vi.fn(), getDoc: vi.fn(), startAfter: vi.fn(), increment: vi.fn(),
}));


const NOW = new Date(2026, 9, 1, 10, 0, 0); // 1 Oct 2026 10:00 local
const property = (over: Partial<Property> = {}): Property => ({
  id: "prop1", landlordId: "landlord1", type: "apartment", title: "2 bed in Kabulonga", description: "", price: 9000, currency: "ZMW",
  rentFrequency: "monthly", bedrooms: 2, bathrooms: 1, parkingSpaces: 1,
  amenities: { water: true, electricity: true, parking: true, security: true, garden: false, borehole: false, furnished: false, internet: false, airConditioning: false, petFriendly: false },
  location: { province: "Lusaka Province", city: "Lusaka", area: "Kabulonga", hideExactAddress: true }, photos: [],
  status: "approved", isVerified: true, viewCount: 0, savedCount: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
});
const tenant = { id: "tenant1", firstName: "Mwansa", lastName: "Banda" };
const base = { propertyId: "prop1", tenant, requestedDate: "2026-10-05", requestedTime: "14:00" };

function deps(over: Partial<SubmitDeps> = {}) {
  const created: { id: string; data: Record<string, unknown> }[] = [];
  const notified: unknown[] = [];
  const d: SubmitDeps = {
    currentUid: () => "tenant1",
    getProperty: async () => property(),
    listTenantRequests: async () => [],
    createRequest: async (id, data) => { created.push({ id, data }); },
    notify: async (n) => { notified.push(n); },
    now: () => NOW,
    ...over,
  };
  return { d, created, notified };
}

describe("viewing request creation", () => {
  it("tenant creates a request; landlord comes from the PROPERTY; landlord is notified", async () => {
    const { d, created, notified } = deps();
    const id = await submitViewingRequestWith(d, { ...base, message: "  Can I see the garden? " });
    expect(created).toHaveLength(1);
    const { data } = created[0]!;
    expect(id).toBe("tenant1_prop1_2026-10-05_1400");
    expect(data).toMatchObject({ tenantId: "tenant1", landlordId: "landlord1", propertyId: "prop1", status: "pending", message: "Can I see the garden?", tenantName: "Mwansa Banda", propertyTitle: "2 bed in Kabulonga" });
    expect(notified).toHaveLength(1);
    expect((notified[0] as { userId: string }).userId).toBe("landlord1");
  });

  it("REGRESSION: no message => field omitted, never `undefined` (Firestore rejects undefined)", async () => {
    const { d, created } = deps();
    await submitViewingRequestWith(d, base);
    const data = created[0]!.data;
    expect("message" in data).toBe(false);
    expect(Object.values(data).some((v) => v === undefined)).toBe(false);
  });

  it("REGRESSION: a failing notification does not fail the request", async () => {
    const { d, created } = deps({ notify: async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); } });
    await expect(submitViewingRequestWith(d, base)).resolves.toBeTruthy();
    expect(created).toHaveLength(1);
  });

  it("rejects when not signed in / signed in as someone else (unauthorized user)", async () => {
    await expect(submitViewingRequestWith(deps({ currentUid: () => null }).d, base)).rejects.toMatchObject({ code: "app/not-signed-in" });
    await expect(submitViewingRequestWith(deps({ currentUid: () => "intruder" }).d, base)).rejects.toMatchObject({ code: "app/not-signed-in" });
  });

  it("rejects an invalid (missing) property", async () => {
    const { d, created } = deps({ getProperty: async () => null });
    await expect(submitViewingRequestWith(d, base)).rejects.toMatchObject({ code: "app/property-unavailable" });
    expect(created).toHaveLength(0);
  });

  it.each(["pending", "rejected", "suspended", "rented", "inactive"] as const)("rejects a non-approved (%s) property", async (status) => {
    const { d, created } = deps({ getProperty: async () => property({ status }) });
    await expect(submitViewingRequestWith(d, base)).rejects.toMatchObject({ code: "app/property-unavailable" });
    expect(created).toHaveLength(0);
  });

  it("rejects requesting a viewing of your own property", async () => {
    const { d } = deps({ getProperty: async () => property({ landlordId: "tenant1" }) });
    await expect(submitViewingRequestWith(d, base)).rejects.toMatchObject({ code: "app/own-property" });
  });

  it("blocks a second open request for the same property (duplicate submission)", async () => {
    const open = { id: "x", propertyId: "prop1", status: "pending" } as ViewingRequest;
    const { d, created } = deps({ listTenantRequests: async () => [open] });
    await expect(submitViewingRequestWith(d, base)).rejects.toMatchObject({ code: "app/duplicate-request" });
    expect(created).toHaveLength(0);
  });

  it("allows re-requesting after cancel/decline, with a fresh id for the same slot", async () => {
    const old = { id: "tenant1_prop1_2026-10-05_1400", propertyId: "prop1", status: "cancelled" } as ViewingRequest;
    const { d, created } = deps({ listTenantRequests: async () => [old] });
    const id = await submitViewingRequestWith(d, base);
    expect(id).toBe("tenant1_prop1_2026-10-05_1400_2");
    expect(created).toHaveLength(1);
  });

  it("rejects bad slots", async () => {
    for (const bad of [
      { requestedDate: "2026-09-30" }, { requestedDate: "2027-05-01" }, { requestedDate: "05/10/2026" },
      { requestedDate: "2026-02-31" }, { requestedTime: "" }, { requestedTime: "24:00" }, { requestedTime: "13:60" },
      { requestedTime: "1:30pm" }, { requestedTime: "9:00" }, { requestedTime: "05:59" }, { requestedTime: "20:01" }, { requestedTime: "noon" },
    ]) {
      await expect(submitViewingRequestWith(deps().d, { ...base, ...bad })).rejects.toBeInstanceOf(AppError);
    }
  });
});

describe("slot validation", () => {
  it("today: past times rejected, later times accepted - any minute, not just fixed slots", () => {
    // NOW = 10:00 on 1 Oct 2026
    expect(validateViewingSlot({ requestedDate: "2026-10-01", requestedTime: "09:00" }, NOW).ok).toBe(false);
    expect(validateViewingSlot({ requestedDate: "2026-10-01", requestedTime: "09:59" }, NOW).ok).toBe(false);
    expect(validateViewingSlot({ requestedDate: "2026-10-01", requestedTime: "10:00" }, NOW).ok).toBe(false);
    expect(validateViewingSlot({ requestedDate: "2026-10-01", requestedTime: "10:01" }, NOW).ok).toBe(true);
    expect(validateViewingSlot({ requestedDate: "2026-10-01", requestedTime: "13:15" }, NOW).ok).toBe(true);
  });
  it("quick-pick chips hide times that already passed today but are only suggestions", () => {
    expect(quickTimesFor("2026-10-01", NOW)).toEqual(["10:30", "12:00", "14:00", "15:30", "17:00"]);
    expect(quickTimesFor("2026-10-02", NOW)).toHaveLength(6);
    expect(quickTimesFor(null, NOW)).toHaveLength(6);
  });
  it("any valid 24h time inside the window is accepted on a future day (13:15, 08:07, 19:45...)", () => {
    for (const t of ["06:00", "08:07", "13:15", "16:42", "19:45", "20:00"]) {
      expect(validateViewingSlot({ requestedDate: "2026-10-05", requestedTime: t }, NOW).ok).toBe(true);
    }
  });
  it("invalid 24h times and times outside viewing hours are rejected with a helpful reason", () => {
    for (const t of ["24:00", "12:60", "9:30", "1315", "13.15", "", "noon", "05:59", "20:01", "23:30", "00:00"]) {
      const r = validateViewingSlot({ requestedDate: "2026-10-05", requestedTime: t }, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(5);
    }
  });
  it("time helpers", () => {
    expect(isValidTimeOfDay("13:15")).toBe(true);
    expect(isValidTimeOfDay("24:00")).toBe(false);
    expect(isWithinViewingHours("06:00")).toBe(true);
    expect(isWithinViewingHours("20:01")).toBe(false);
    expect(formatTimeInput("1315")).toBe("13:15");
    expect(formatTimeInput("13:1")).toBe("13:1");
    expect(formatTimeInput("9")).toBe("09");
    expect(formatTimeInput("930")).toBe("09:30");
    expect(formatTimeInput("abc12345")).toBe("12:34");
    expect(normalizeTimeInput("9:30")).toBe("09:30");
    expect(normalizeTimeInput("13:15")).toBe("13:15");
    expect(normalizeTimeInput("25:00")).toBeNull();
    expect(normalizeTimeInput("")).toBeNull();
  });
  it("a request for a custom time is created, with an id containing that exact time", async () => {
    const { d, created } = deps();
    const id = await submitViewingRequestWith(d, { ...base, requestedTime: "13:15" });
    expect(id).toBe("tenant1_prop1_2026-10-05_1315");
    expect(created[0]!.data).toMatchObject({ requestedTime: "13:15", status: "pending" });
  });
  it("a past time today is rejected by the service and nothing is written", async () => {
    const { d, created } = deps();
    await expect(
      submitViewingRequestWith(d, { ...base, requestedDate: "2026-10-01", requestedTime: "09:30" })
    ).rejects.toMatchObject({ code: "app/invalid-slot" });
    expect(created).toHaveLength(0);
  });
  it("max 60 days ahead", () => {
    expect(validateViewingSlot({ requestedDate: "2026-11-30", requestedTime: "09:00" }, NOW).ok).toBe(true);
    expect(validateViewingSlot({ requestedDate: "2026-12-01", requestedTime: "09:00" }, NOW).ok).toBe(false);
  });
  it("message length cap", () => {
    expect(validateViewingSlot({ requestedDate: "2026-10-05", requestedTime: "09:00", message: "x".repeat(501) }, NOW).ok).toBe(false);
  });
  it("id builder is deterministic", () => {
    expect(buildViewingRequestId("t", "p", "2026-10-05", "09:00")).toBe("t_p_2026-10-05_0900");
  });
});

describe("viewing state machine", () => {
  const all: ViewingRequestStatus[] = ["pending", "accepted", "declined", "cancelled", "completed"];
  const allowedTenant = new Set(["pending>cancelled", "accepted>cancelled"]);
  const allowedLandlord = new Set(["pending>accepted", "pending>declined", "accepted>completed", "accepted>cancelled"]);

  it("allows exactly the documented transitions and nothing else", () => {
    for (const from of all) for (const to of all) {
      expect(canTransition("tenant", from, to), `tenant ${from}>${to}`).toBe(allowedTenant.has(`${from}>${to}`));
      expect(canTransition("landlord", from, to), `landlord ${from}>${to}`).toBe(allowedLandlord.has(`${from}>${to}`));
    }
  });

  const req = { id: "r1", status: "pending" as ViewingRequestStatus, tenantId: "tenant1", landlordId: "landlord1" };
  function tdeps() {
    const updates: [string, string][] = []; const notes: { userId: string; type: string }[] = [];
    const d: TransitionDeps = { updateStatus: async (id, s) => { updates.push([id, s]); }, notify: async (n) => { notes.push(n); } };
    return { d, updates, notes };
  }

  it("landlord accepts -> tenant notified", async () => {
    const { d, updates, notes } = tdeps();
    await transitionViewingRequestWith(d, req, "accepted", "landlord");
    expect(updates).toEqual([["r1", "accepted"]]);
    expect(notes[0]).toMatchObject({ userId: "tenant1", type: "viewing_accepted" });
  });
  it("landlord declines -> tenant notified", async () => {
    const { d, notes } = tdeps();
    await transitionViewingRequestWith(d, req, "declined", "landlord");
    expect(notes[0]).toMatchObject({ userId: "tenant1", type: "viewing_declined" });
  });
  it("tenant cancels a pending request -> landlord notified", async () => {
    const { d, updates, notes } = tdeps();
    await transitionViewingRequestWith(d, req, "cancelled", "tenant");
    expect(updates).toEqual([["r1", "cancelled"]]);
    expect(notes[0]).toMatchObject({ userId: "landlord1", type: "viewing_cancelled" });
  });
  it("tenant can cancel an accepted request (landlord notified) but cannot accept their own", async () => {
    const { d, updates, notes } = tdeps();
    await transitionViewingRequestWith(d, { ...req, status: "accepted" }, "cancelled", "tenant");
    expect(updates).toEqual([["r1", "cancelled"]]);
    expect(notes[0]).toMatchObject({ userId: "landlord1", type: "viewing_cancelled" });
    await expect(transitionViewingRequestWith(d, req, "accepted", "tenant")).rejects.toMatchObject({ code: "app/invalid-transition" });
    expect(updates).toHaveLength(1);
  });
  it("landlord can cancel an accepted viewing (tenant notified); declined/cancelled/completed are final", async () => {
    const { d, notes } = tdeps();
    await transitionViewingRequestWith(d, { ...req, status: "accepted" }, "cancelled", "landlord");
    expect(notes[0]).toMatchObject({ userId: "tenant1", type: "viewing_cancelled" });
    for (const status of ["declined", "cancelled", "completed"] as ViewingRequestStatus[]) {
      await expect(transitionViewingRequestWith(d, { ...req, status }, "cancelled", "tenant")).rejects.toBeInstanceOf(AppError);
      await expect(transitionViewingRequestWith(d, { ...req, status }, "accepted", "landlord")).rejects.toBeInstanceOf(AppError);
    }
  });
  it("cannot mark a viewing completed before its scheduled time, but can after", async () => {
    const { d, updates } = tdeps();
    const accepted = { ...req, status: "accepted" as ViewingRequestStatus, requestedDate: "2026-10-05", requestedTime: "14:00" };
    await expect(transitionViewingRequestWith(d, accepted, "completed", "landlord", new Date(2026, 9, 5, 13, 0))).rejects.toMatchObject({ code: "app/too-early" });
    expect(updates).toHaveLength(0);
    await transitionViewingRequestWith(d, accepted, "completed", "landlord", new Date(2026, 9, 5, 14, 30));
    expect(updates).toEqual([["r1", "completed"]]);
  });
  it("lock id is one per tenant+property", () => {
    expect(buildViewingLockId("tenant1", "prop1")).toBe("tenant1_prop1");
  });
  it("landlord can complete only an accepted request; terminal states are final", async () => {
    const { d } = tdeps();
    await expect(transitionViewingRequestWith(d, req, "completed", "landlord")).rejects.toBeInstanceOf(AppError);
    await expect(transitionViewingRequestWith(d, { ...req, status: "declined" }, "accepted", "landlord")).rejects.toBeInstanceOf(AppError);
    await expect(transitionViewingRequestWith(d, { ...req, status: "accepted" }, "completed", "landlord")).resolves.toBeUndefined();
  });
  it("notification failure does not fail the status change", async () => {
    const d: TransitionDeps = { updateStatus: async () => {}, notify: async () => { throw new Error("nope"); } };
    await expect(transitionViewingRequestWith(d, req, "accepted", "landlord")).resolves.toBeUndefined();
  });
});
