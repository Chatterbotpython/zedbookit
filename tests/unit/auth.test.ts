import { describe, expect, it, vi } from "vitest";
import {
  authGroupDecision,
  guardDecision,
  homeRouteForRole,
  loadProfileWithRetry,
  resolveEntryDestination,
  statusForResult,
  type AuthStatus,
  type ProfileLoadResult,
} from "@/auth/authState";
import type { UserProfile, UserRole } from "@/types";
import { normalizeUserProfile } from "@/services/users.service";

vi.mock("@/config/firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: vi.fn(), arrayUnion: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }));

const profile = (role: UserRole, extra: Partial<UserProfile> = {}): UserProfile => ({
  id: "u1", role, firstName: "A", lastName: "B", email: "a@b.zm", isSuspended: false,
  createdAt: new Date(), updatedAt: new Date(), ...extra,
});

describe("auth state machine", () => {
  it("never treats loading as signed out (entry route waits)", () => {
    for (const s of ["initializing", "loading_profile"] as AuthStatus[]) {
      expect(resolveEntryDestination(s, null)).toEqual({ kind: "wait" });
      expect(guardDecision(s, null, "any")).toEqual({ kind: "wait" });
      expect(guardDecision(s, null, ["tenant"])).toEqual({ kind: "wait" });
      expect(authGroupDecision(s)).toEqual({ kind: "wait" });
    }
  });

  it.each([
    ["tenant", "/(tenant)/home"],
    ["landlord", "/(landlord)/dashboard"],
    ["agent", "/(landlord)/dashboard"],
    ["admin", "/(admin)/dashboard"],
  ] as [UserRole, string][])("successful %s login routes to %s", (role, href) => {
    expect(homeRouteForRole(role)).toBe(href);
    expect(resolveEntryDestination("authenticated", profile(role))).toEqual({ kind: "redirect", href });
  });

  it("unauthenticated goes to onboarding / login, and may view the auth group", () => {
    expect(resolveEntryDestination("unauthenticated", null)).toEqual({ kind: "redirect", href: "/(auth)/onboarding" });
    expect(guardDecision("unauthenticated", null, ["tenant"])).toEqual({ kind: "redirect", href: "/(auth)/login" });
    expect(authGroupDecision("unauthenticated")).toEqual({ kind: "allow" });
  });

  it("signed-in people are bounced out of the auth group (no login screen while signed in)", () => {
    expect(authGroupDecision("authenticated")).toEqual({ kind: "redirect", href: "/" });
  });

  it("role guards: right role allowed, wrong role sent to entry route (which then re-routes)", () => {
    expect(guardDecision("authenticated", profile("tenant"), ["tenant"])).toEqual({ kind: "allow" });
    expect(guardDecision("authenticated", profile("tenant"), ["landlord", "agent"])).toEqual({ kind: "redirect", href: "/" });
    expect(guardDecision("authenticated", profile("tenant"), ["admin"])).toEqual({ kind: "redirect", href: "/" });
    expect(guardDecision("authenticated", profile("agent"), ["landlord", "agent"])).toEqual({ kind: "allow" });
    expect(guardDecision("authenticated", profile("admin"), ["admin"])).toEqual({ kind: "allow" });
    expect(guardDecision("authenticated", profile("landlord"), "any")).toEqual({ kind: "allow" });
  });

  it("missing profile, suspended and error states go to account-status (not login: no redirect loop)", () => {
    for (const s of ["profile_missing", "suspended", "error"] as AuthStatus[]) {
      expect(resolveEntryDestination(s, null)).toEqual({ kind: "redirect", href: "/account-status" });
      expect(guardDecision(s, null, "any")).toEqual({ kind: "redirect", href: "/account-status" });
    }
  });

  it("maps load results to statuses", () => {
    expect(statusForResult({ kind: "ok", profile: profile("tenant") })).toBe("authenticated");
    expect(statusForResult({ kind: "ok", profile: profile("tenant", { isSuspended: true }) })).toBe("suspended");
    expect(statusForResult({ kind: "missing" })).toBe("profile_missing");
    expect(statusForResult({ kind: "invalid" })).toBe("profile_missing");
    expect(statusForResult({ kind: "error", code: "permission-denied" })).toBe("error");
  });
});

describe("profile loading", () => {
  const noSleep = async () => {};

  it("retries a missing profile (registration race) until it appears", async () => {
    const results: ProfileLoadResult[] = [{ kind: "missing" }, { kind: "missing" }, { kind: "ok", profile: profile("landlord") }];
    const fetch = vi.fn(async () => results.shift()!);
    const r = await loadProfileWithRetry(fetch, { sleep: noSleep });
    expect(r.kind).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("gives up with 'missing' after the retry budget", async () => {
    const fetch = vi.fn(async (): Promise<ProfileLoadResult> => ({ kind: "missing" }));
    const r = await loadProfileWithRetry(fetch, { sleep: noSleep });
    expect(r.kind).toBe("missing");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry permission errors", async () => {
    const fetch = vi.fn(async (): Promise<ProfileLoadResult> => ({ kind: "error", code: "permission-denied" }));
    const r = await loadProfileWithRetry(fetch, { sleep: noSleep });
    expect(r).toEqual({ kind: "error", code: "permission-denied" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries transient network errors", async () => {
    const results: ProfileLoadResult[] = [{ kind: "error", code: "unavailable" }, { kind: "ok", profile: profile("tenant") }];
    const fetch = vi.fn(async () => results.shift()!);
    expect((await loadProfileWithRetry(fetch, { sleep: noSleep })).kind).toBe("ok");
  });

  it("does not retry a corrupt profile", async () => {
    const fetch = vi.fn(async (): Promise<ProfileLoadResult> => ({ kind: "invalid" }));
    await loadProfileWithRetry(fetch, { sleep: noSleep });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeUserProfile", () => {
  it("accepts all four roles and defaults missing fields", () => {
    for (const role of ["tenant", "landlord", "agent", "admin"]) {
      const p = normalizeUserProfile("x", { role });
      expect(p?.role).toBe(role);
      expect(p?.isSuspended).toBe(false);
      expect(p?.firstName).toBe("");
    }
  });
  it("rejects unknown/missing roles (corrupt profile)", () => {
    expect(normalizeUserProfile("x", { role: "superuser" })).toBeNull();
    expect(normalizeUserProfile("x", {})).toBeNull();
    expect(normalizeUserProfile("x", undefined)).toBeNull();
  });
  it("accepts roles typed by hand with different case/whitespace (e.g. console-edited admin)", () => {
    expect(normalizeUserProfile("x", { role: "Admin" })?.role).toBe("admin");
    expect(normalizeUserProfile("x", { role: " landlord " })?.role).toBe("landlord");
    expect(normalizeUserProfile("x", { role: "TENANT" })?.role).toBe("tenant");
    expect(normalizeUserProfile("x", { role: "" })).toBeNull();
    expect(normalizeUserProfile("x", {})).toBeNull();
  });
  it("flags suspended accounts", () => {
    expect(normalizeUserProfile("x", { role: "tenant", isSuspended: true })?.isSuspended).toBe(true);
  });
});
