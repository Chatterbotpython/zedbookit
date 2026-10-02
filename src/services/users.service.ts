import { arrayUnion, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { UserProfile, UserRole } from "@/types";
import { isValidRole, type ProfileLoadResult } from "@/auth/authState";
import { getErrorCode } from "./errors";

/**
 * Deliberately narrow: only fields a user should ever be able to edit about
 * themselves. `role` and `isSuspended` are excluded on purpose — they can
 * only be set at registration (role) or by an admin (isSuspended), and
 * `firestore.rules` independently enforces this server-side.
 */
export type EditableProfileFields = Partial<
  Pick<UserProfile, "firstName" | "lastName" | "phone" | "photoURL" | "city">
>;

export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return isValidRole(cleaned) ? cleaned : null;
}

/**
 * Defensive parse of a users/{uid} document. Older documents may lack fields;
 * a missing/unknown role makes the profile unusable (returns null) because the
 * app cannot decide which experience to show.
 */
export function normalizeUserProfile(id: string, data: Record<string, unknown> | undefined): UserProfile | null {
  if (!data) return null;
  // Roles set by hand in the Firebase console are easy to mistype ("Admin", "admin ").
  const role = normalizeRole(data.role);
  if (!role) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id,
    role,
    firstName: str(data.firstName),
    lastName: str(data.lastName),
    email: str(data.email),
    phone: typeof data.phone === "string" ? data.phone : undefined,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : undefined,
    city: typeof data.city === "string" ? data.city : undefined,
    isSuspended: data.isSuspended === true,
    fcmTokens: Array.isArray(data.fcmTokens) ? data.fcmTokens.filter((t): t is string => typeof t === "string") : undefined,
    createdAt: data.createdAt as UserProfile["createdAt"],
    updatedAt: data.updatedAt as UserProfile["updatedAt"],
  };
}

/** Non-throwing variant used by the auth state machine. */
export async function loadUserProfile(userId: string): Promise<ProfileLoadResult> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return { kind: "missing" };
    const profile = normalizeUserProfile(snap.id, snap.data() as Record<string, unknown>);
    if (profile) return { kind: "ok", profile };
    const raw = (snap.data() as Record<string, unknown>).role;
    return { kind: "invalid", roleFound: typeof raw === "string" ? raw : raw === undefined ? "(none)" : typeof raw };
  } catch (error) {
    return { kind: "error", code: getErrorCode(error) || "unknown" };
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  return normalizeUserProfile(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateUserProfile(
  userId: string,
  updates: EditableProfileFields
): Promise<void> {
  await updateDoc(doc(db, "users", userId), { ...updates, updatedAt: serverTimestamp() });
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  await updateDoc(doc(db, "users", userId), { fcmTokens: arrayUnion(token) });
}
