import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getPropertiesByLandlord } from "@/services/properties.service";
import { getViewingRequestsForLandlord } from "@/services/viewingRequests.service";
import { getMaintenanceRequestsForLandlord } from "@/services/maintenance.service";

export default function LandlordDashboard() {
  const theme = useTheme();
  const { profile } = useAuth();
  const enabled = !!profile;
  const propertiesQ = useAsyncData(() => getPropertiesByLandlord(profile!.id), [profile?.id], { enabled, context: "property" });
  const viewingsQ = useAsyncData(() => getViewingRequestsForLandlord(profile!.id), [profile?.id], { enabled, context: "viewing" });
  const maintenanceQ = useAsyncData(() => getMaintenanceRequestsForLandlord(profile!.id), [profile?.id], { enabled, context: "maintenance" });
  const properties = propertiesQ.data;
  const viewings = viewingsQ.data;
  const maintenance = maintenanceQ.data;
  const firstError = propertiesQ.error ?? viewingsQ.error ?? maintenanceQ.error;
  const refreshing = propertiesQ.refreshing || viewingsQ.refreshing || maintenanceQ.refreshing;
  const refreshAll = () => Promise.all([propertiesQ.refresh(), viewingsQ.refresh(), maintenanceQ.refresh()]).then(() => undefined);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const activeProperties = properties?.filter((p) => p.status === "approved" || p.status === "vacant" || p.status === "rented").length ?? 0;
  const totalViews = properties?.reduce((sum, p) => sum + (p.viewCount ?? 0), 0) ?? 0;
  const totalSaved = properties?.reduce((sum, p) => sum + (p.savedCount ?? 0), 0) ?? 0;
  const pendingViewings = viewings?.filter((v) => v.status === "pending").length ?? 0;
  const openMaintenance = maintenance?.filter((m) => !["completed", "cancelled"].includes(m.status)).length ?? 0;
  const completedMaintenance = maintenance?.filter((m) => m.status === "completed").length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme.colors.accent} />}
      >
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>
          {greeting}, {profile?.firstName}.
        </Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4, marginBottom: theme.spacing.lg }}>
          Here's how your properties are doing.
        </Text>

        {firstError && !properties && !viewings && !maintenance ? (
          <ErrorState message={firstError} onRetry={refreshAll} />
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: theme.spacing.lg }}>
          <StatCard label="Active properties" value={activeProperties} />
          <StatCard label="Property views" value={totalViews} />
          <StatCard label="Saved by tenants" value={totalSaved} />
          <Pressable style={{ width: "47%" }} onPress={() => router.push("/(landlord)/viewings")} accessibilityRole="button" accessibilityLabel="Open viewing requests">
            <StatCard label="Pending viewings" value={pendingViewings} accent full />
          </Pressable>
          <StatCard label="Open maintenance" value={openMaintenance} accent={openMaintenance > 0} />
          <StatCard label="Completed maintenance" value={completedMaintenance} />
        </View>

        <View style={{ gap: 10 }}>
          <Button label="Add a new property" onPress={() => router.push("/(landlord)/properties/add")} />
          <Button label="Viewing requests" variant="outline" onPress={() => router.push("/(landlord)/viewings")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, accent, full }: { label: string; value: number; accent?: boolean; full?: boolean }) {
  const theme = useTheme();
  return (
    <Card style={{ padding: 16, width: full ? "100%" : "47%" }}>
      <Text style={{ ...theme.typography.display, fontSize: 28, color: accent ? theme.colors.accent : theme.colors.textPrimary }}>
        {value}
      </Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 }}>{label}</Text>
    </Card>
  );
}
