import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { authGroupDecision, guardDecision } from "@/auth/authState";
import { FullScreenLoader } from "./FullScreenLoader";
import type { UserRole } from "@/types";

/**
 * Wraps a protected route group. Children are NOT rendered (so none of their
 * effects/queries run) until authentication AND the profile/role have resolved
 * and the role is permitted. While unresolved a loader is shown — it is never
 * treated as "signed out", so there is no redirect to login mid-load.
 */
export function RoleGuard({ allow, children }: { allow: readonly UserRole[] | "any"; children: React.ReactNode }) {
  const { status, profile } = useAuth();
  const decision = guardDecision(status, profile, allow);
  if (decision.kind === "wait") return <FullScreenLoader />;
  if (decision.kind === "redirect") return <Redirect href={decision.href as never} />;
  return <>{children}</>;
}

/** Guards the (auth) group: signed-in people are sent on to the app. */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const decision = authGroupDecision(status);
  if (decision.kind === "wait") return <FullScreenLoader />;
  if (decision.kind === "redirect") return <Redirect href={decision.href as never} />;
  return <>{children}</>;
}
