/**
 * Pure (React-free, Firebase-free) authentication state machine helpers.
 * Keeping the decisions here makes the login/redirect behaviour unit-testable.
 *
 * States:
 *  - initializing     Firebase has not yet told us whether a session exists.
 *  - loading_profile  A Firebase user exists; the Firestore profile/role is loading.
 *  - authenticated    Firebase user + valid, active profile.
 *  - unauthenticated  No Firebase user.
 *  - profile_missing  Firebase user exists but users/{uid} is absent or corrupt.
 *  - suspended        Profile loaded but isSuspended === true.
 *  - error            Profile could not be loaded (permissions/network/etc.).
 *
 * INVARIANT: "loading" is never interpreted as "signed out". Navigation code
 * must treat `initializing` and `loading_profile` as "wait".
 */
import type { UserProfile, UserRole } from "@/types";

export type AuthStatus =
  | "initializing"
  | "loading_profile"
  | "authenticated"
  | "unauthenticated"
  | "profile_missing"
  | "suspended"
  | "error";

export const VALID_ROLES: readonly UserRole[] = ["tenant", "landlord", "agent", "admin"];

export type ProfileLoadResult =
  | { kind: "ok"; profile: UserProfile }
  | { kind: "missing" }
  | { kind: "invalid"; roleFound?: string }
  | { kind: "error"; code: string };

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role);
}

/** Maps a load result to the status the app should be in. */
export function statusForResult(result: ProfileLoadResult): AuthStatus {
  switch (result.kind) {
    case "ok":
      return result.profile.isSuspended ? "suspended" : "authenticated";
    case "missing":
    case "invalid":
      return "profile_missing";
    case "error":
      return "error";
  }
}

export function isResolving(status: AuthStatus): boolean {
  return status === "initializing" || status === "loading_profile";
}

const TRANSIENT_CODES = new Set(["unavailable", "deadline-exceeded", "network-request-failed", "aborted", "cancelled"]);

function shortCode(code: string): string {
  const i = code.indexOf("/");
  return i >= 0 ? code.slice(i + 1) : code;
}

export interface RetryOptions {
  /** Delay (ms) before each attempt. Length = number of attempts. */
  delays?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Loads the profile, retrying when it is missing (registration writes the
 * Firestore profile a moment AFTER Firebase Auth reports the new user) or when
 * the failure looks transient. Permission errors are not retried.
 */
export async function loadProfileWithRetry(
  fetchProfile: () => Promise<ProfileLoadResult>,
  { delays = [0, 400, 1000, 2000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: RetryOptions = {}
): Promise<ProfileLoadResult> {
  let last: ProfileLoadResult = { kind: "missing" };
  for (let i = 0; i < delays.length; i++) {
    const wait = delays[i] ?? 0;
    if (wait > 0) await sleep(wait);
    last = await fetchProfile();
    if (last.kind === "ok" || last.kind === "invalid") return last;
    if (last.kind === "error" && !TRANSIENT_CODES.has(shortCode(last.code))) return last;
  }
  return last;
}

export type Destination =
  | { kind: "wait" }
  | { kind: "redirect"; href: string };

export function homeRouteForRole(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/(admin)/dashboard";
    case "landlord":
    case "agent":
      return "/(landlord)/dashboard";
    case "tenant":
      return "/(tenant)/home";
  }
}

/** Where the entry route ("/") should send the person. */
export function resolveEntryDestination(status: AuthStatus, profile: UserProfile | null): Destination {
  switch (status) {
    case "initializing":
    case "loading_profile":
      return { kind: "wait" };
    case "unauthenticated":
      return { kind: "redirect", href: "/(auth)/onboarding" };
    case "authenticated":
      if (!profile) return { kind: "redirect", href: "/account-status" };
      return { kind: "redirect", href: homeRouteForRole(profile.role) };
    case "profile_missing":
    case "suspended":
    case "error":
      return { kind: "redirect", href: "/account-status" };
  }
}

export type GuardDecision =
  | { kind: "wait" }
  | { kind: "allow" }
  | { kind: "redirect"; href: string };

/** Decision for a protected route group. `allow` = roles permitted, or "any". */
export function guardDecision(
  status: AuthStatus,
  profile: UserProfile | null,
  allow: readonly UserRole[] | "any"
): GuardDecision {
  if (isResolving(status)) return { kind: "wait" };
  if (status === "unauthenticated") return { kind: "redirect", href: "/(auth)/login" };
  if (status !== "authenticated" || !profile) return { kind: "redirect", href: "/account-status" };
  if (allow !== "any" && !allow.includes(profile.role)) return { kind: "redirect", href: "/" };
  return { kind: "allow" };
}

/** Decision for the (auth) group: signed-in people must not sit on login screens. */
export function authGroupDecision(status: AuthStatus): GuardDecision {
  if (isResolving(status)) return { kind: "wait" };
  if (status === "unauthenticated") return { kind: "allow" };
  return { kind: "redirect", href: "/" };
}
