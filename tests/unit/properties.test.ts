import { describe, expect, it, vi } from "vitest";
import { applyClientFilters, normalizeProperty, searchWithFetcher, type PageFetcher } from "@/services/properties.service";
import type { DocumentSnapshot } from "firebase/firestore";

vi.mock("@/config/firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn(() => ({})), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(),
  increment: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(),
  startAfter: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}));


const raw = (i: number, extra: Record<string, unknown> = {}) => ({
  landlordId: "L1", type: "apartment", title: `Home ${i}`, price: 1000 + i * 100, bedrooms: (i % 4) + 1, bathrooms: 1,
  status: "approved", location: { city: "Lusaka", area: i % 2 ? "Kabulonga" : "Woodlands" }, amenities: { furnished: i % 3 === 0 },
  photos: ["https://x/y.jpg"], ...extra,
});

/** Fake paged collection of `n` approved docs. */
function fakeFetcher(n: number, mk = raw): PageFetcher {
  const all = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, data: mk(i), snapshot: { id: `p${i}` } as unknown as DocumentSnapshot }));
  return async (cursor, size) => {
    const start = cursor ? all.findIndex((d) => d.id === (cursor as unknown as { id: string }).id) + 1 : 0;
    return { docs: all.slice(start, start + size) };
  };
}

describe("normalizeProperty (old / partial documents never crash)", () => {
  it("survives a completely empty document", () => {
    const p = normalizeProperty("x", {});
    expect(p.photos).toEqual([]);
    expect(p.location.city).toBe("");
    expect(p.amenities.water).toBe(false);
    expect(p.title).toBe("Untitled property");
    expect(p.status).toBe("pending");
    expect(p.viewCount).toBe(0);
  });
  it("drops bad photo entries and keeps valid data", () => {
    const p = normalizeProperty("x", { ...raw(1), photos: ["a", 5, "", null] });
    expect(p.photos).toEqual(["a"]);
    expect(p.price).toBe(1100);
  });
});

describe("property discovery paging", () => {
  it("ZERO properties -> empty page, no error", async () => {
    const page = await searchWithFetcher(fakeFetcher(0), {});
    expect(page.properties).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
  it("ONE property", async () => {
    const page = await searchWithFetcher(fakeFetcher(1), {});
    expect(page.properties).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });
  it("MULTIPLE properties across pages, no duplicates, cursor advances", async () => {
    const f = fakeFetcher(30);
    const p1 = await searchWithFetcher(f, {}, null, 12);
    expect(p1.properties).toHaveLength(12);
    expect(p1.hasMore).toBe(true);
    const p2 = await searchWithFetcher(f, {}, p1.lastDoc, 12);
    const p3 = await searchWithFetcher(f, {}, p2.lastDoc, 12);
    expect(p3.properties).toHaveLength(6);
    expect(p3.hasMore).toBe(false);
    const ids = [...p1.properties, ...p2.properties, ...p3.properties].map((p) => p.id);
    expect(new Set(ids).size).toBe(30);
  });
  it("exactly one full page reports hasMore true then an empty final page", async () => {
    const f = fakeFetcher(12);
    const p1 = await searchWithFetcher(f, {}, null, 12);
    expect(p1.hasMore).toBe(true);
    const p2 = await searchWithFetcher(f, {}, p1.lastDoc, 12);
    expect(p2.properties).toEqual([]);
    expect(p2.hasMore).toBe(false);
  });
  it("client-side filters (price, bedrooms, area, amenity) still fill a page", async () => {
    const f = fakeFetcher(60);
    const page = await searchWithFetcher(f, { area: "Kabulonga", minPrice: 2000 }, null, 5);
    expect(page.properties).toHaveLength(5);
    expect(page.properties.every((p) => p.location.area === "Kabulonga" && p.price >= 2000)).toBe(true);
    const furnished = await searchWithFetcher(f, { amenities: { furnished: true } }, null, 5);
    expect(furnished.properties.every((p) => p.amenities.furnished)).toBe(true);
  });
  it("filters that match nothing -> empty page (not an error) once exhausted", async () => {
    const page = await searchWithFetcher(fakeFetcher(10), { minPrice: 999999 }, null, 12);
    expect(page.properties).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
  it("applyClientFilters bedrooms/bathrooms", () => {
    const list = [1, 2, 3].map((i) => normalizeProperty(`p${i}`, raw(i)));
    expect(applyClientFilters(list, { bedrooms: 3 }).every((p) => p.bedrooms >= 3)).toBe(true);
    expect(applyClientFilters(list, { bathrooms: 2 })).toEqual([]);
  });
  it("a fetch failure propagates so the UI can offer retry", async () => {
    const failing: PageFetcher = async () => { throw Object.assign(new Error("x"), { code: "unavailable" }); };
    await expect(searchWithFetcher(failing, {})).rejects.toBeTruthy();
  });
});

describe("property status handling", () => {
  it("only approved listings survive a discovery query (pending/rented/inactive are excluded server-side)", () => {
    // The discovery query always constrains status == approved (see searchProperties) and rules
    // enforce it; normalization must keep unknown statuses from being treated as approved.
    expect(normalizeProperty("a", { status: "rented" }).status).toBe("rented");
    expect(normalizeProperty("a", { status: "weird" }).status).toBe("pending");
  });
});
