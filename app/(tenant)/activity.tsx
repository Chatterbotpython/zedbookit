import React, { useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useToast } from "@/components/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { cancelViewingRequest, getViewingRequestsForTenant } from "@/services/viewingRequests.service";
import { allowedTransitions } from "@/services/viewingRequests.logic";
import { logError, toUserMessage } from "@/services/errors";
import { getMaintenanceRequestsForTenant } from "@/services/maintenance.service";
import { markNotificationRead } from "@/services/notifications.service";
import { formatCalendarDate, formatRelative } from "@/utils/date";
import { MAINTENANCE_STATUS_LABEL } from "@/constants/categories";
import type { AppNotification, ViewingRequest } from "@/types";

type Tab = "viewings" | "maintenance" | "notifications";

const VIEWING_STATUS_TONE: Record<ViewingRequest["status"], "success" | "danger" | "neutral" | "warning"> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  cancelled: "neutral",
  completed: "neutral",
};

export default function Activity() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { notifications } = useNotifications();
  const [tab, setTab] = useState<Tab>("viewings");
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const cancelling_ = useRef<Set<string>>(new Set()); // synchronous double-tap guard

  const viewings = useAsyncData(() => getViewingRequestsForTenant(profile!.id), [profile?.id], {
    enabled: !!profile,
    context: "viewing",
  });
  const maintenance = useAsyncData(() => getMaintenanceRequestsForTenant(profile!.id), [profile?.id], {
    enabled: !!profile,
    context: "maintenance",
  });

  function confirmCancel(request: ViewingRequest) {
    Alert.alert("Cancel this viewing request?", "The landlord will be told you can no longer make it.", [
      { text: "Keep request", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => void doCancel(request) },
    ]);
  }

  async function doCancel(request: ViewingRequest) {
    if (cancelling_.current.has(request.id)) return;
    cancelling_.current.add(request.id);
    setCancelling(new Set(cancelling_.current));
    try {
      await cancelViewingRequest(request);
      viewings.setData((prev) => (prev ?? []).map((r) => (r.id === request.id ? { ...r, status: "cancelled" } : r)));
      showToast("Viewing request cancelled.", "success");
    } catch (error) {
      logError("viewing.cancel", error);
      showToast(toUserMessage(error, "viewing"), "error");
    } finally {
      cancelling_.current.delete(request.id);
      setCancelling(new Set(cancelling_.current));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Activity
      </Text>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
        <TabButton label="Viewings" active={tab === "viewings"} onPress={() => setTab("viewings")} />
        <TabButton label="Maintenance" active={tab === "maintenance"} onPress={() => setTab("maintenance")} />
        <TabButton
          label="Notifications"
          active={tab === "notifications"}
          onPress={() => setTab("notifications")}
          badgeCount={notifications.filter((n) => !n.isRead).length}
        />
      </View>

      {tab === "viewings" ? (
        viewings.error && viewings.data === null ? (
          <ErrorState message={viewings.error} onRetry={viewings.reload} />
        ) : (
          <FlatList
            data={viewings.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={viewings.refreshing} onRefresh={viewings.refresh} tintColor={theme.colors.accent} />}
            ListEmptyComponent={
              viewings.data !== null ? <EmptyState emoji="📅" title="No viewing requests yet." subtitle="Request a viewing from any property page." /> : null
            }
            renderItem={({ item }) => (
              <Card style={{ padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, flex: 1, marginRight: 8 }}>
                    {formatCalendarDate(item.requestedDate) || "Date to be confirmed"} · {item.requestedTime}
                  </Text>
                  <Badge label={item.status} tone={VIEWING_STATUS_TONE[item.status]} />
                </View>
                {item.propertyTitle ? (
                  <Pressable onPress={() => router.push(`/property/${item.propertyId}`)}>
                    <Text style={{ ...theme.typography.caption, color: theme.colors.accent, marginTop: 4 }} numberOfLines={1}>
                      {item.propertyTitle}
                    </Text>
                  </Pressable>
                ) : null}
                {item.message ? (
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 6 }}>
                    “{item.message}”
                  </Text>
                ) : null}
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 6 }}>
                  Requested {formatRelative(item.createdAt) || "just now"}
                </Text>
                {allowedTransitions("tenant", item.status).includes("cancelled") ? (
                  <View style={{ marginTop: 10 }}>
                    <Button
                      label="Cancel request"
                      variant="outline"
                      size="sm"
                      onPress={() => confirmCancel(item)}
                      loading={cancelling.has(item.id)}
                    />
                  </View>
                ) : null}
              </Card>
            )}
          />
        )
      ) : null}

      {tab === "maintenance" ? (
        maintenance.error && maintenance.data === null ? (
          <ErrorState message={maintenance.error} onRetry={maintenance.reload} />
        ) : (
          <FlatList
            data={maintenance.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={maintenance.refreshing} onRefresh={maintenance.refresh} tintColor={theme.colors.accent} />}
            ListEmptyComponent={
              maintenance.data !== null ? <EmptyState emoji="🛠" title="No maintenance requests." subtitle="Everything looks good." /> : null
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/maintenance/${item.id}`)}>
                <Card style={{ padding: 14, marginBottom: 12 }}>
                  <Text style={{ ...theme.typography.micro, color: theme.colors.textMuted }}>{item.referenceNumber}</Text>
                  <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginTop: 2 }}>
                    {item.title}
                  </Text>
                  <View style={{ flexDirection: "row", marginTop: 8 }}>
                    <Badge label={MAINTENANCE_STATUS_LABEL[item.status]} tone={item.status === "completed" ? "success" : "info"} />
                  </View>
                </Card>
              </Pressable>
            )}
          />
        )
      ) : null}

      {tab === "notifications" ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState emoji="🔔" title="No notifications yet." subtitle="We'll let you know when a landlord responds." />}
          renderItem={({ item }) => (
            <Pressable onPress={() => markNotificationRead(item.id)}>
              <NotificationRow notification={item} />
            </Pressable>
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
  badgeCount,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badgeCount?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.accent : theme.colors.surfaceSubtle,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Text style={{ ...theme.typography.captionMedium, color: active ? theme.colors.textInverse : theme.colors.accent }}>
        {label}
      </Text>
      {badgeCount ? (
        <View style={{ backgroundColor: theme.colors.danger, borderRadius: 8, paddingHorizontal: 5 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{badgeCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const theme = useTheme();
  return (
    <Card style={{ padding: 14, marginBottom: 10, borderLeftWidth: notification.isRead ? 0 : 3, borderLeftColor: theme.colors.accent }}>
      <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>{notification.title}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>{notification.body}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 6 }}>
        {formatRelative(notification.createdAt)}
      </Text>
    </Card>
  );
}
