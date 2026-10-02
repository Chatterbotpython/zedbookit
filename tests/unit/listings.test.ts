import { describe, expect, it, vi } from "vitest";
import {
  ALL_PROPERTY_STATUSES, LISTED_STATUSES, LIVE_STATUSES, OWNER_AVAILABILITY_STATUSES,
  PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE, allowedOwnerStatuses, canOwnerChangeStatus, isListedStatus,
} from "@/constants/propertyStatus";
import { MAX_PROPERTY_PHOTOS, PHOTO_UPLOAD_CONCURRENCY } from "@/constants/limits";
import { mapWithConcurrency, mergePhotoSelection, remainingPhotoSlots } from "@/utils/photos";
import { buildTenantDisplayName, conversationTitle } from "@/utils/conversation";
import { buildConversationFields } from "@/services/messaging.service";
import { createProperty, normalizeProperty, type NewProperty } from "@/services/properties.service";
import type { PropertyStatus } from "@/types";

let created = 0;
const addDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: `new_${++created}` }));
const getDocs = vi.fn();
vi.mock("@/config/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn(() => ({})), doc: vi.fn(), getDoc: vi.fn(), getDocs: (...a: unknown[]) => getDocs(...a),
  addDoc: (...a: unknown[]) => addDoc(...a), increment: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"), startAfter: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
  onSnapshot: vi.fn(), setDoc: vi.fn(),
}));

const input = (title: string): NewProperty => ({
  landlordId: "landlord1", type: "apartment", title, description: "Nice place", price: 5000, currency: "ZMW",
  rentFrequency: "monthly", bedrooms: 2, bathrooms: 1, parkingSpaces: 0,
  amenities: { water: true, electricity: true, parking: false, security: false, garden: false, borehole: false, furnished: false, internet: false, airConditioning: false, petFriendly: false },
  location: { province: "Lusaka Province", city: "Lusaka", area: "Chalala", hideExactAddress: true },
  photos: [],
});

describe("1. landlords can submit multiple properties", () => {
  it("creating property B while A is still pending is not blocked and checks nothing first", async () => {
    addDoc.mockClear();
    getDocs.mockClear();
    const a = await createProperty(input("Property A"));
    const b = await createProperty(input("Property B"));
    expect(a).not.toBe(b);
    expect(addDoc).toHaveBeenCalledTimes(2);
    // no "do you already have a pending listing?" lookup anywhere in the create path
    expect(getDocs).not.toHaveBeenCalled();
    const payloads = addDoc.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(payloads.map((p) => p.status)).toEqual(["pending", "pending"]);
    expect(payloads.map((p) => p.title)).toEqual(["Property A", "Property B"]);
    expect(payloads.every((p) => p.isVerified === false && p.landlordId === "landlord1")).toBe(true);
  });
});

describe("2. vacant / rented / sold statuses", () => {
  it("vacant is publicly listed, rented and sold are not", () => {
    expect([...LISTED_STATUSES]).toEqual(["approved", "vacant"]);
    expect(isListedStatus("vacant")).toBe(true);
    expect(isListedStatus("approved")).toBe(true);
    for (const s of ["rented", "sold", "pending", "rejected", "suspended", "inactive"] as PropertyStatus[]) {
      expect(isListedStatus(s)).toBe(false);
    }
  });
  it("an approved listing can be marked vacant, rented or sold by its owner", () => {
    for (const to of OWNER_AVAILABILITY_STATUSES) expect(canOwnerChangeStatus("approved", to)).toBe(true);
  });
  it("owners can move between live statuses (e.g. rented -> vacant, sold -> vacant)", () => {
    expect(canOwnerChangeStatus("rented", "vacant")).toBe(true);
    expect(canOwnerChangeStatus("vacant", "rented")).toBe(true);
    expect(canOwnerChangeStatus("sold", "vacant")).toBe(true);
  });
  it("SECURITY: owners cannot reach a live status from pending/inactive/rejected (would skip admin review)", () => {
    for (const from of ["pending", "inactive", "rejected"] as PropertyStatus[]) {
      for (const to of LIVE_STATUSES) expect(canOwnerChangeStatus(from, to)).toBe(false);
    }
  });
  it("SECURITY: a suspended listing can't be changed by its owner at all", () => {
    expect(allowedOwnerStatuses("suspended")).toEqual([]);
  });
  it("existing behaviour is preserved: pending <-> inactive, rejected -> pending", () => {
    expect(canOwnerChangeStatus("pending", "inactive")).toBe(true);
    expect(canOwnerChangeStatus("inactive", "pending")).toBe(true);
    expect(canOwnerChangeStatus("rejected", "pending")).toBe(true);
    expect(canOwnerChangeStatus("pending", "approved")).toBe(false);
  });
  it("every status has a label and badge tone, and old documents still parse", () => {
    for (const s of ALL_PROPERTY_STATUSES) {
      expect(PROPERTY_STATUS_LABEL[s]).toBeTruthy();
      expect(PROPERTY_STATUS_TONE[s]).toBeTruthy();
      expect(normalizeProperty("x", { status: s }).status).toBe(s);
    }
    expect(normalizeProperty("x", { status: "banana" }).status).toBe("pending");
  });
});

describe("3. more than 10 photos", () => {
  const uris = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `file:///photo-${from + i}.jpg`);

  it("limit is a single shared constant, higher than the old 10", () => {
    expect(MAX_PROPERTY_PHOTOS).toBe(30);
    expect(MAX_PROPERTY_PHOTOS).toBeGreaterThan(10);
  });
  it("more than 10 photos are kept (previously sliced to 10)", () => {
    const m = mergePhotoSelection(uris(10), uris(15, 10));
    expect(m.photos).toHaveLength(25);
    expect(m.droppedForLimit).toBe(0);
  });
  it("adding photos never discards the existing selection or reorders it", () => {
    const existing = uris(12);
    const m = mergePhotoSelection(existing, uris(5, 100));
    expect(m.photos.slice(0, 12)).toEqual(existing);
    expect(m.photos).toHaveLength(17);
  });
  it("multiple separate selections accumulate", () => {
    let photos: string[] = [];
    for (let i = 0; i < 4; i++) photos = mergePhotoSelection(photos, uris(6, i * 6)).photos;
    expect(photos).toHaveLength(24);
  });
  it("caps at the limit and reports how many were left out", () => {
    const m = mergePhotoSelection(uris(28), uris(5, 100));
    expect(m.photos).toHaveLength(MAX_PROPERTY_PHOTOS);
    expect(m.droppedForLimit).toBe(3);
  });
  it("de-duplicates the same photo picked twice", () => {
    const m = mergePhotoSelection(uris(3), [...uris(3), ...uris(2, 50)]);
    expect(m.photos).toHaveLength(5);
    expect(m.duplicates).toBe(3);
  });
  it("picker limit shrinks as photos are added", () => {
    expect(remainingPhotoSlots(0)).toBe(30);
    expect(remainingPhotoSlots(12)).toBe(18);
    expect(remainingPhotoSlots(30)).toBe(0);
    expect(remainingPhotoSlots(45)).toBe(0);
  });
  it("uploads all 30 with bounded concurrency, results in order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency(uris(30), PHOTO_UPLOAD_CONCURRENCY, async (u, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return `https://r2/${i}-${u}`;
    });
    expect(out).toHaveLength(30);
    expect(out[7]).toBe("https://r2/7-file:///photo-7.jpg");
    expect(peak).toBeLessThanOrEqual(PHOTO_UPLOAD_CONCURRENCY);
  });
  it("an upload failure rejects and stops starting new uploads", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency(uris(20), 3, async (_u, i) => {
        started.push(i);
        if (i === 4) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 2));
        return i;
      })
    ).rejects.toThrow("boom");
    expect(started.length).toBeLessThan(20);
  });
  it("existing properties with more than 10 photos still parse with every photo", () => {
    const p = normalizeProperty("x", { photos: uris(23) });
    expect(p.photos).toHaveLength(23);
  });
});

describe("5. landlord sees the tenant's name", () => {
  it("landlord title is the tenant's name, not 'Property enquiry'", () => {
    expect(conversationTitle({ context: "property_enquiry", tenantName: "Mwansa Banda" }, "landlord")).toBe("Mwansa Banda");
    expect(conversationTitle({ context: "property_enquiry", tenantName: "Mwansa Banda" }, "agent")).toBe("Mwansa Banda");
  });
  it("old conversations without a stored name get a safe fallback (never blank, never an id)", () => {
    expect(conversationTitle({ context: "property_enquiry" }, "landlord")).toBe("Tenant enquiry");
    expect(conversationTitle({ context: "property_enquiry", tenantName: "   " }, "landlord")).toBe("Tenant enquiry");
  });
  it("tenants and maintenance threads keep their generic titles", () => {
    expect(conversationTitle({ context: "property_enquiry", tenantName: "Mwansa Banda" }, "tenant")).toBe("Property enquiry");
    expect(conversationTitle({ context: "maintenance" }, "landlord")).toBe("Maintenance conversation");
  });
  it("display name is first + last only, trimmed and capped", () => {
    expect(buildTenantDisplayName({ firstName: " Mwansa ", lastName: "Banda " })).toBe("Mwansa Banda");
    expect(buildTenantDisplayName({ firstName: "Mwansa" })).toBe("Mwansa");
    expect(buildTenantDisplayName({ firstName: "x".repeat(200), lastName: "y" }).length).toBeLessThanOrEqual(80);
  });
  const args = { propertyId: "p1", tenantId: "t1", landlordId: "l1", lastMessage: "Hello" };
  it("the tenant's message stores their name on the conversation", () => {
    const f = buildConversationFields({ ...args, senderId: "t1", senderName: "Mwansa Banda" });
    expect(f.tenantName).toBe("Mwansa Banda");
    expect(f.participantIds).toEqual(["t1", "l1"]);
  });
  it("a landlord's reply can never write or overwrite the tenant name", () => {
    const f = buildConversationFields({ ...args, senderId: "l1", senderName: "Landlord Person" });
    expect("tenantName" in f).toBe(false);
  });
  it("only the name is stored - no email, phone, tokens or other profile data", () => {
    const f = buildConversationFields({ ...args, senderId: "t1", senderName: "Mwansa Banda" });
    expect(Object.keys(f).sort()).toEqual(["context", "lastMessage", "participantIds", "propertyId", "tenantName"]);
  });
  it("no name supplied => field omitted (never undefined)", () => {
    const f = buildConversationFields({ ...args, senderId: "t1" });
    expect("tenantName" in f).toBe(false);
  });
});
