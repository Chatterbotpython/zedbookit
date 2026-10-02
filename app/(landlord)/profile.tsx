import React from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, User as UserIcon, Bell, HelpCircle } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { logout } from "@/services/auth.service";

export default function LandlordProfile() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();

  async function handleLogout() {
    try {
      await logout();
      router.replace("/(auth)/onboarding");
    } catch {
      showToast("Couldn't log out. Please try again.", "error");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        Profile
      </Text>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Card style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: theme.spacing.lg }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ ...theme.typography.h2, color: theme.colors.accent }}>{profile?.firstName?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <View>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary }}>
              {profile?.firstName} {profile?.lastName}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>
              {profile?.role === "agent" ? "Property agent" : "Landlord"} · {profile?.email}
            </Text>
          </View>
        </Card>

        <MenuRow icon={<UserIcon size={18} color={theme.colors.textSecondary} />} label="Edit profile" />
        <MenuRow icon={<Bell size={18} color={theme.colors.textSecondary} />} label="Notification preferences" />
        <MenuRow icon={<HelpCircle size={18} color={theme.colors.textSecondary} />} label="Help & support" />

        <Pressable onPress={handleLogout} style={{ marginTop: theme.spacing.lg }}>
          <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LogOut size={18} color={theme.colors.danger} />
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.danger }}>Log out</Text>
          </Card>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MenuRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  const theme = useTheme();
  return (
    <Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider, gap: 12 }}>
        {icon}
        <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 }}>{label}</Text>
      </View>
    </Pressable>
  );
}
