import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { logout, subscribeToAuthChanges } from "@/services/auth.service";
import { loadUserProfile } from "@/services/users.service";
import { registerForPushNotificationsAsync } from "@/services/push.service";
import { logError } from "@/services/errors";
import {
  isResolving,
  loadProfileWithRetry,
  statusForResult,
  type AuthStatus,
  type ProfileLoadResult,
} from "@/auth/authState";
import type { UserProfile } from "@/types";

interface AuthState {
  status: AuthStatus;
  firebaseUser: User | null;
  profile: UserProfile | null;
  /** Technical reason for profile_missing / error (never shown raw to users). */
  errorCode: string | null;
}

interface AuthContextValue extends AuthState {
  /** true while the app cannot yet tell whether the person is signed in (initializing | loading_profile). */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Silently re-reads the profile (e.g. after editing it). Never flips the app into a loading state. */
  refreshProfile: () => Promise<void>;
  /** Re-runs the full profile load with a visible loading state (used by the account-status screen). */
  retryProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const INITIAL: AuthState = { status: "initializing", firebaseUser: null, profile: null, errorCode: null };

const AuthContext = createContext<AuthContextValue>({
  ...INITIAL,
  isLoading: true,
  isAuthenticated: false,
  refreshProfile: async () => {},
  retryProfile: async () => {},
  signOut: async () => {},
});

function applyResult(user: User, result: ProfileLoadResult): AuthState {
  return {
    status: statusForResult(result),
    firebaseUser: user,
    profile: result.kind === "ok" ? result.profile : null,
    errorCode: result.kind === "error" ? result.code : result.kind === "invalid" ? `invalid-profile:${result.roleFound ?? "?"}` : result.kind === "missing" ? "profile-missing" : null,
  };
}

/**
 * Owns the authentication state machine.
 *
 * Every Firebase auth event moves state ATOMICALLY (one setState) so there is
 * never a render where a Firebase user exists but the status still says
 * "unauthenticated"/"resolved" while the profile is still loading. That window
 * was what used to bounce freshly logged-in people back to the login/onboarding
 * screens.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);
  // Incremented for every auth event so a slow profile load for a previous
  // user/session can never overwrite the state of the current one.
  const generation = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      const mine = ++generation.current;

      if (!user) {
        setState({ status: "unauthenticated", firebaseUser: null, profile: null, errorCode: null });
        return;
      }

      // Signed in: WAIT for the profile. Keep an already-loaded profile for the same uid.
      setState((prev) => ({
        status: "loading_profile",
        firebaseUser: user,
        profile: prev.firebaseUser?.uid === user.uid ? prev.profile : null,
        errorCode: null,
      }));

      loadProfileWithRetry(() => loadUserProfile(user.uid))
        .then((result) => {
          if (mine !== generation.current) return; // stale
          if (result.kind === "error") logError("loadProfile", { code: result.code });
          const next = applyResult(user, result);
          setState(next);
          if (next.status === "authenticated") {
            // Best-effort; must never block or break the app.
            registerForPushNotificationsAsync(user.uid).catch(() => {});
          }
        })
        .catch((error) => {
          if (mine !== generation.current) return;
          logError("loadProfile", error);
          setState({ status: "error", firebaseUser: user, profile: null, errorCode: "unknown" });
        });
    });
    return unsubscribe;
  }, []);

  const reload = useCallback(async (visible: boolean) => {
    const user = stateRef.current.firebaseUser;
    if (!user) return;
    const mine = ++generation.current;
    if (visible) {
      setState((prev) => ({ ...prev, status: "loading_profile", errorCode: null }));
    }
    const result = await loadProfileWithRetry(() => loadUserProfile(user.uid));
    if (mine !== generation.current) return;
    if (!visible && result.kind === "error") return; // keep the working session on a transient refresh failure
    setState(applyResult(user, result));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isLoading: isResolving(state.status),
      isAuthenticated: state.status === "authenticated",
      refreshProfile: () => reload(false),
      retryProfile: () => reload(true),
      signOut: logout,
    }),
    [state, reload]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
