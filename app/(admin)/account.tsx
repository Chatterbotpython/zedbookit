import React from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, ShieldCheck } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { useToast } from "@/components/Toast";
import { logout } from "@/services/auth.service";

export default function AdminAccount() {
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
        Account
      </Text>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Card style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: theme.spacing.lg }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.colors.surfaceSubtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={26} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary }}>
              {profile?.firstName} {profile?.lastName}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 6 }}>
              {profile?.email}
            </Text>
            <Badge label="Admin" tone="accent" />
          </View>
        </Card>

        <Pressable onPress={handleLogout}>
          <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LogOut size={18} color={theme.colors.danger} />
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.danger }}>Sign out</Text>
          </Card>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
