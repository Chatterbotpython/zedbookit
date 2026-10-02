import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { getPlatformStats } from "@/services/admin.service";
import { logError, toUserMessage } from "@/services/errors";

type Stats = Awaited<ReturnType<typeof getPlatformStats>>;


export default function AdminDashboard() {
  const theme = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getPlatformStats();
      setStats(s);
    } catch (e) {
      logError("admin.stats", e);
      setError(toUserMessage(e, "admin"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const rows: { label: string; value: number | undefined }[] = [
    { label: "Total users", value: stats?.totalUsers },
    { label: "Active tenants", value: stats?.activeTenants },
    { label: "Active landlords", value: stats?.activeLandlords },
    { label: "Active properties", value: stats?.activeProperties },
    { label: "Pending approvals", value: stats?.pendingApprovals },
    { label: "Open maintenance", value: stats?.openMaintenance },
    { label: "Completed maintenance", value: stats?.completedMaintenance },
    { label: "Viewing requests", value: stats?.viewingRequests },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      >
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, marginBottom: 4 }}>Platform overview</Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg }}>
          ZedBookIt admin console
        </Text>

        {error ? (
          <Card style={{ padding: 14, marginBottom: theme.spacing.lg }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.danger, marginBottom: 10 }}>{error}</Text>
            <Button label="Retry" variant="outline" size="sm" onPress={load} />
          </Card>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {stats === null && !error
            ? rows.map((row) => (
                <Card key={row.label} style={{ padding: 16, width: "47%" }}>
                  <Skeleton style={{ width: 48, height: 26 }} />
                  <Skeleton style={{ width: "70%", height: 12, marginTop: 8 }} />
                </Card>
              ))
            : rows.map((row) => (
                <Card key={row.label} style={{ padding: 16, width: "47%" }}>
                  <Text style={{ ...theme.typography.display, fontSize: 26, color: theme.colors.textPrimary }}>
                    {row.value ?? "—"}
                  </Text>
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 }}>{row.label}</Text>
                </Card>
              ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
