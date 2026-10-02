import React from "react";
import { Stack } from "expo-router";
import { RoleGuard } from "@/components/RouteGuard";

/** Shared, signed-in-only screens (property details, viewing requests, maintenance, chat...). */
export default function AppLayout() {
  return (
    <RoleGuard allow="any">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
