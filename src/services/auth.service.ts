import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/config/firebase";
import type { UserRole } from "@/types";
import { AppError, logError, toUserMessage } from "./errors";
import { normalizeZambianPhone } from "@/utils/validators";

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole; // only "tenant" or "landlord" selectable at signup; "agent"/"admin" are provisioned separately
  phone?: string;
}

/**
 * Creates the Firebase Auth user AND the corresponding `users/{uid}` Firestore
 * profile document. The role is written once; firestore.rules then forbid the
 * client from ever changing its own `role`/`isSuspended` again.
 *
 * Note: Firebase reports the new user via onAuthStateChanged as soon as the
 * account exists, i.e. BEFORE the profile document below is written. The
 * AuthProvider therefore waits/retries for the profile instead of treating a
 * momentarily missing profile as "signed out".
 */
export async function registerWithEmail(input: RegisterInput): Promise<User> {
  if (input.role !== "tenant" && input.role !== "landlord") {
    throw new AppError("Please choose whether you're looking for a home or listing property.", "app/invalid-role");
  }
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);

  try {
    await updateProfile(credential.user, { displayName: `${input.firstName} ${input.lastName}` });
  } catch (error) {
    logError("register.updateProfile", error); // cosmetic only
  }

  const phone = input.phone ? normalizeZambianPhone(input.phone) : null;
  try {
    await setDoc(doc(db, "users", credential.user.uid), {
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      ...(phone ? { phone } : {}),
      isSuspended: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Don't leave an orphaned Auth account with no profile: remove it so the
    // person can simply try registering again.
    logError("register.createProfile", error);
    await credential.user.delete().catch(() => fbSignOut(auth).catch(() => {}));
    throw error;
  }

  return credential.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function logout(): Promise<void> {
  await fbSignOut(auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/** Maps raw Firebase Auth error codes to friendly, non-technical copy. */
export function friendlyAuthError(error: unknown): string {
  return toUserMessage(error, "auth");
}

/**
 * For a signed-in Auth user whose `users/{uid}` document does not exist (e.g. it was
 * never written, or the Firestore database was reset). firestore.rules only allow this
 * create for tenant/landlord and only when the document is absent, so it can never be
 * used to change the role of an existing account or to become an admin.
 */
export async function createMissingProfile(
  user: User,
  data: { role: "tenant" | "landlord"; firstName: string; lastName: string }
): Promise<void> {
  await setDoc(doc(db, "users", user.uid), {
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
    email: user.email ?? "",
    isSuspended: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
