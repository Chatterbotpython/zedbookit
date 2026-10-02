import React from "react";
import { Tabs } from "expo-router";
import { Home, Compass, Heart, Bell, User } from "lucide-react-native";
import { useTheme } from "@/theme";
import { RoleGuard } from "@/components/RouteGuard";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";

export default function TenantLayout() {
  const theme = useTheme();

  return (
    <RoleGuard allow={["tenant"]}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          position: Platform.OS === "ios" ? "absolute" : undefined,
          backgroundColor: Platform.OS === "ios" ? "transparent" : theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 88,
          paddingTop: 8,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={80} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
    </RoleGuard>
  );
}
