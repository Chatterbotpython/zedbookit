import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/components/Toast";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Keeps the splash screen up until Firebase has reported the auth state (with a safety cap). */
function SplashGate() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== "initializing") {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const cap = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 6000);
    return () => clearTimeout(cap);
  }, [status]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <SplashGate />
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="account-status" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="(tenant)" />
              <Stack.Screen name="(landlord)" />
              <Stack.Screen name="(admin)" />
            </Stack>
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
