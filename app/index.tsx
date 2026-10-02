import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { resolveEntryDestination } from "@/auth/authState";
import { FullScreenLoader } from "@/components/FullScreenLoader";

/**
 * The single entry point that decides where a person lands, driven by the
 * auth state machine (see src/auth/authState.ts):
 *  - initializing / loading_profile -> wait (spinner); NEVER treated as signed out
 *  - unauthenticated                -> onboarding
 *  - authenticated tenant           -> tenant tabs
 *  - authenticated landlord/agent   -> landlord dashboard
 *  - authenticated admin            -> admin console
 *  - profile missing / suspended / error -> account status screen
 */
export default function Index() {
  const { status, profile } = useAuth();
  const destination = resolveEntryDestination(status, profile);
  if (destination.kind === "wait") return <FullScreenLoader />;
  return <Redirect href={destination.href as never} />;
}
