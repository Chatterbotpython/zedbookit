import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import {
  assignMaintenance,
  getMaintenanceRequestsForLandlord,
  scheduleMaintenance,
  updateMaintenanceStatus,
} from "@/services/maintenance.service";
import { MAINTENANCE_STATUS_LABEL, URGENCY_LEVELS } from "@/constants/categories";
import { formatRelative } from "@/utils/date";
import type { AssigneeType, MaintenanceRequest, MaintenanceStatus } from "@/types";
import { logError } from "@/services/errors";

type TabKey = "open" | "scheduled" | "in_progress" | "completed";

const TAB_STATUS_MAP: Record<TabKey, MaintenanceStatus[]> = {
  open: ["submitted", "under_review", "assigned"],
  scheduled: ["scheduled"],
  in_progress: ["in_progress", "waiting_for_parts"],
  completed: ["completed", "cancelled"],
};

export default function LandlordMaintenance() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("open");
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState("");
  const [assigneeType, setAssigneeType] = useState<AssigneeType>("external_technician");

  const userId = profile?.id;
  const reload = useCallback(() => {
    if (!userId) return;
    getMaintenanceRequestsForLandlord(userId)
      .then(setRequests)
      .catch((e) => {
        logError("landlord.maintenance", e);
        setRequests((prev) => prev ?? []);
      });
  }, [userId]);

  useEffect(reload, [reload]);

  const filtered = (requests ?? []).filter((r) => TAB_STATUS_MAP[tab].includes(r.status));

  async function handleAssign() {
    if (!assigningId || !profile || !assigneeName.trim()) return;
    const request = requests?.find((r) => r.id === assigningId);
    if (!request) return;
    try {
      await assignMaintenance(request, {
        assignedTo: assigneeName.trim(),
        assigneeType,
        assignedBy: profile.id,
      });
      showToast("Technician assigned.", "success");
      setAssigningId(null);
      setAssigneeName("");
      reload();
    } catch {
      showToast("Couldn't assign this request.", "error");
    }
  }

  async function handleQuickStatus(request: MaintenanceRequest, status: MaintenanceStatus) {
    try {
      await updateMaintenanceStatus(request, status, profile!.id);
      showToast(`Marked as ${MAINTENANCE_STATUS_LABEL[status]}.`, "success");
      reload();
    } catch {
      showToast("Couldn't update this request.", "error");
    }
  }

  async function handleScheduleTomorrow(request: MaintenanceRequest) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    try {
      await scheduleMaintenance(request, tomorrow, profile!.id);
      showToast("Scheduled for tomorrow at 10:00.", "success");
      reload();
    } catch {
      showToast("Couldn't schedule this request.", "error");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Maintenance
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: 8, marginBottom: theme.spacing.sm }}>
        {(["open", "scheduled", "in_progress", "completed"] as TabKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: theme.radius.pill,
              backgroundColor: tab === key ? theme.colors.accent : theme.colors.surfaceSubtle,
            }}
          >
            <Text style={{ color: tab === key ? "#fff" : theme.colors.accent, fontWeight: "600", fontSize: 13, textTransform: "capitalize" }}>
              {key.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1, paddingBottom: 140 }}
        ListEmptyComponent={
          requests !== null ? <EmptyState emoji="🛠" title="Nothing here." subtitle="Everything looks good." /> : null
        }
        renderItem={({ item }) => {
          const urgency = URGENCY_LEVELS.find((u) => u.value === item.urgency);
          return (
            <Card style={{ padding: 14, marginBottom: 12 }}>
              <Pressable onPress={() => router.push(`/maintenance/${item.id}`)}>
                <Text style={{ ...theme.typography.micro, color: theme.colors.textMuted }}>{item.referenceNumber}</Text>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginTop: 2 }}>{item.title}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {urgency ? <Badge label={urgency.label} tone={urgency.color} /> : null}
                  <Badge label={MAINTENANCE_STATUS_LABEL[item.status]} tone="info" />
                </View>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 6 }}>
                  Submitted {formatRelative(item.createdAt)}
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {item.status === "submitted" || item.status === "under_review" ? (
                  <SmallButton label="Review" onPress={() => handleQuickStatus(item, "under_review")} />
                ) : null}
                {["submitted", "under_review"].includes(item.status) ? (
                  <SmallButton
                    label="Assign"
                    onPress={() => {
                      setAssigningId(item.id);
                      setAssigneeName("");
                    }}
                  />
                ) : null}
                {item.status === "assigned" ? (
                  <SmallButton label="Schedule (tomorrow 10am)" onPress={() => handleScheduleTomorrow(item)} />
                ) : null}
                {item.status === "scheduled" ? (
                  <SmallButton label="Mark in progress" onPress={() => handleQuickStatus(item, "in_progress")} />
                ) : null}
                {item.status === "in_progress" ? (
                  <SmallButton label="Mark completed" onPress={() => handleQuickStatus(item, "completed")} />
                ) : null}
                <SmallButton label="Message tenant" onPress={() => router.push(`/maintenance/${item.id}`)} />
              </View>
            </Card>
          );
        }}
      />

      <Modal transparent visible={assigningId !== null} animationType="fade" onRequestClose={() => setAssigningId(null)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.overlay, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg }}>
          <View style={{ width: "100%", backgroundColor: theme.colors.background, borderRadius: theme.radius.lg, padding: theme.spacing.lg }}>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 12 }}>Assign this request</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["self", "external_technician", "maintenance_worker"] as AssigneeType[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setAssigneeType(option)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: theme.radius.sm,
                    alignItems: "center",
                    backgroundColor: assigneeType === option ? theme.colors.accent : theme.colors.surfaceSubtle,
                  }}
                >
                  <Text style={{ fontSize: 11, color: assigneeType === option ? "#fff" : theme.colors.accent }}>
                    {option.replace("_", " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={assigneeName}
              onChangeText={setAssigneeName}
              placeholder="Name (e.g. Bwalya Phiri, ABC Plumbers)"
              placeholderTextColor={theme.colors.textMuted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                padding: 12,
                color: theme.colors.textPrimary,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="outline" onPress={() => setAssigningId(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Assign" onPress={handleAssign} disabled={!assigneeName.trim()} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceSubtle,
      }}
    >
      <Text style={{ fontSize: 12, color: theme.colors.accent, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
