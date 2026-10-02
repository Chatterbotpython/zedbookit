import React, { useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useToast } from "@/components/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getViewingRequestsForLandlord, transitionViewingRequest } from "@/services/viewingRequests.service";
import { allowedTransitions } from "@/services/viewingRequests.logic";
import { logError, toUserMessage } from "@/services/errors";
import { formatCalendarDate, formatRelative } from "@/utils/date";
import type { ViewingRequest, ViewingRequestStatus } from "@/types";

const TONE: Record<ViewingRequestStatus, "success" | "danger" | "neutral" | "warning"> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  cancelled: "neutral",
  completed: "neutral",
};

/** Landlord/agent inbox for viewing requests: accept, decline, or mark completed. */
export default function LandlordViewings() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const busyRef = useRef<Set<string>>(new Set());

  const requests = useAsyncData(() => getViewingRequestsForLandlord(profile!.id), [profile?.id], {
    enabled: !!profile,
    context: "viewing",
  });

  async function change(request: ViewingRequest, to: ViewingRequestStatus) {
    if (busyRef.current.has(request.id)) return;
    busyRef.current.add(request.id);
    setBusy(new Set(busyRef.current));
    try {
      await transitionViewingRequest(request, to, "landlord");
      requests.setData((prev) => (prev ?? []).map((r) => (r.id === request.id ? { ...r, status: to } : r)));
      showToast(to === "accepted" ? "Viewing accepted." : to === "declined" ? "Viewing declined." : to === "cancelled" ? "Viewing cancelled." : "Marked as completed.", "success");
    } catch (error) {
      logError("viewing.transition", error);
      showToast(toUserMessage(error, "viewing"), "error");
    } finally {
      busyRef.current.delete(request.id);
      setBusy(new Set(busyRef.current));
    }
  }

  function confirmCancel(request: ViewingRequest) {
    Alert.alert("Cancel this viewing?", "The tenant will be notified.", [
      { text: "Keep viewing", style: "cancel" },
      { text: "Cancel viewing", style: "destructive", onPress: () => void change(request, "cancelled") },
    ]);
  }

  function confirmDecline(request: ViewingRequest) {
    Alert.alert("Decline this viewing?", "The tenant will be notified.", [
      { text: "Keep pending", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => void change(request, "declined") },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: theme.spacing.lg, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>Viewing requests</Text>
      </View>

      {requests.error && requests.data === null ? (
        <ErrorState message={requests.error} onRetry={requests.reload} />
      ) : (
        <FlatList
          data={requests.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={requests.refreshing} onRefresh={requests.refresh} tintColor={theme.colors.accent} />}
          ListEmptyComponent={
            requests.data !== null ? (
              <EmptyState emoji="📅" title="No viewing requests yet." subtitle="When tenants ask to view your properties, they'll appear here." />
            ) : null
          }
          renderItem={({ item }) => {
            const next = allowedTransitions("landlord", item.status);
            return (
              <Card style={{ padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, flex: 1, marginRight: 8 }}>
                    {formatCalendarDate(item.requestedDate) || "Date to be confirmed"} · {item.requestedTime}
                  </Text>
                  <Badge label={item.status} tone={TONE[item.status]} />
                </View>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 }} numberOfLines={1}>
                  {item.tenantName || "A tenant"}{item.propertyTitle ? ` · ${item.propertyTitle}` : ""}
                </Text>
                {item.message ? (
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 6 }}>“{item.message}”</Text>
                ) : null}
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 6 }}>
                  Requested {formatRelative(item.createdAt) || "just now"}
                </Text>
                {next.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    {next.includes("accepted") ? (
                      <View style={{ flex: 1 }}>
                        <Button label="Accept" size="sm" onPress={() => change(item, "accepted")} loading={busy.has(item.id)} />
                      </View>
                    ) : null}
                    {next.includes("declined") ? (
                      <View style={{ flex: 1 }}>
                        <Button label="Decline" size="sm" variant="outline" onPress={() => confirmDecline(item)} disabled={busy.has(item.id)} />
                      </View>
                    ) : null}
                    {next.includes("cancelled") ? (
                      <View style={{ flex: 1 }}>
                        <Button label="Cancel" size="sm" variant="outline" onPress={() => confirmCancel(item)} disabled={busy.has(item.id)} />
                      </View>
                    ) : null}
                    {next.includes("completed") ? (
                      <View style={{ flex: 1 }}>
                        <Button label="Mark completed" size="sm" variant="secondary" onPress={() => change(item, "completed")} loading={busy.has(item.id)} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
