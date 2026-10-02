import React, { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { getMaintenanceHistoryForProperty } from "@/services/maintenance.service";
import { MAINTENANCE_STATUS_LABEL } from "@/constants/categories";
import { formatDayOnly } from "@/utils/date";
import type { MaintenanceRequest } from "@/types";
import { logError } from "@/services/errors";

export default function MaintenanceHistory() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);

  const userId = profile?.id;
  const userRole = profile?.role;
  useEffect(() => {
    if (!propertyId || !userId || !userRole) return;
    let cancelled = false;
    getMaintenanceHistoryForProperty(propertyId, { id: userId, role: userRole })
      .then((data) => {
        if (!cancelled) setRequests(data.requests);
      })
      .catch((e) => {
        logError("maintenance.history", e);
        if (!cancelled) setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, userId, userRole]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary }}>Maintenance history</Text>
      </View>

      <FlatList
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={
          requests !== null ? <EmptyState emoji="🛠" title="No maintenance requests." subtitle="Everything looks good." /> : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/maintenance/${item.id}`)}>
            <Card style={{ padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>{item.title}</Text>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 }}>
                  {formatDayOnly(item.completedAt ?? item.createdAt)}
                </Text>
              </View>
              <Badge label={MAINTENANCE_STATUS_LABEL[item.status]} tone={item.status === "completed" ? "success" : "info"} />
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
