import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { compareByCreatedAtDesc, formatCalendarDate, toJsDate } from "@/utils/date";
import { formatRent, formatZMW } from "@/utils/currency";
import { normalizeZambianPhone } from "@/utils/validators";
import { parseEnquiryConversationId } from "@/services/messaging.service";
vi.mock("firebase/firestore", () => ({
  Timestamp: class { constructor(public s: number) {} toDate() { return new Date(this.s * 1000); } },
  collection: vi.fn(() => ({})), doc: vi.fn(), addDoc: vi.fn(), setDoc: vi.fn(), onSnapshot: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(),
}));

vi.mock("@/config/firebase", () => ({ db: {}, auth: {} }));

describe("dates", () => {
  it("toJsDate tolerates Timestamp, Date, ISO string, {seconds}, junk", () => {
    expect(toJsDate(new (Timestamp as never as new (s: number) => never)(1000))?.getTime()).toBe(1_000_000);
    expect(toJsDate(new Date(5))?.getTime()).toBe(5);
    expect(toJsDate("2026-10-05")).toBeInstanceOf(Date);
    expect(toJsDate({ seconds: 2, nanoseconds: 0 } as never)?.getTime()).toBe(2000);
    expect(toJsDate("not a date")).toBeNull();
    expect(toJsDate(undefined)).toBeNull();
    expect(toJsDate(new Date("x"))).toBeNull();
  });
  it("calendar dates don't drift across timezones", () => {
    expect(formatCalendarDate("2026-10-05")).toBe("Mon 5 Oct 2026");
    expect(formatCalendarDate("garbage")).toBe("");
    expect(formatCalendarDate(undefined)).toBe("");
  });
  it("pending server timestamps sort as newest", () => {
    const rows = [{ createdAt: new Date(1000) }, { createdAt: undefined }, { createdAt: new Date(5000) }];
    expect([...rows].sort(compareByCreatedAtDesc).map((r) => r.createdAt?.getTime())).toEqual([undefined, 5000, 1000]);
  });
});

describe("Zambia formatting", () => {
  it("ZMW and rent frequency", () => {
    expect(formatZMW(8500)).toBe("K 8,500");
    expect(formatRent(1200, "weekly")).toBe("K 1,200 / week");
  });
  it("phone numbers normalise to +260", () => {
    expect(normalizeZambianPhone("0977 123 456")).toBe("+260977123456");
    expect(normalizeZambianPhone("260955123456")).toBe("+260955123456");
    expect(normalizeZambianPhone("+260966123456")).toBe("+260966123456");
    expect(normalizeZambianPhone("12345")).toBeNull();
  });
});

describe("enquiry conversation ids", () => {
  it("round-trips property/tenant/landlord so landlord replies land in the tenant's thread", () => {
    expect(parseEnquiryConversationId("enquiry_p1_t1_l1")).toEqual({ propertyId: "p1", tenantId: "t1", landlordId: "l1" });
    expect(parseEnquiryConversationId("enquiry_p1_t1")).toBeNull();
    expect(parseEnquiryConversationId("other_a_b_c")).toBeNull();
  });
});
