import React from "react";
import { Stack } from "expo-router";
import { GuestGuard } from "@/components/RouteGuard";

export default function AuthLayout() {
  return (
    <GuestGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack>
    </GuestGuard>
  );
}
