import React from "react";
import { Tabs } from "expo-router";
import { LayoutGrid, Building2, Wrench, MessageCircle, User } from "lucide-react-native";
import { useTheme } from "@/theme";
import { RoleGuard } from "@/components/RouteGuard";

export default function LandlordLayout() {
  const theme = useTheme();

  return (
    <RoleGuard allow={["landlord", "agent"]}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, height: 84, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
      <Tabs.Screen name="properties/index" options={{ title: "Properties", tabBarIcon: ({ color, size }) => <Building2 color={color} size={size} /> }} />
      <Tabs.Screen name="maintenance/index" options={{ title: "Maintenance", tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} /> }} />
      <Tabs.Screen name="messages/index" options={{ title: "Messages", tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
      <Tabs.Screen name="viewings" options={{ href: null }} />
      <Tabs.Screen name="properties/[id]" options={{ href: null }} />
      <Tabs.Screen name="properties/add/index" options={{ href: null }} />
    </Tabs>
    </RoleGuard>
  );
}
