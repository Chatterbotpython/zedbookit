import React, { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ArrowLeft, Send } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/Badge";
import { MaintenanceTimeline } from "@/components/MaintenanceTimeline";
import {
  subscribeToMaintenanceRequest,
  subscribeToTimeline,
  subscribeToMaintenanceMessages,
  sendMaintenanceMessage,
} from "@/services/maintenance.service";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_STATUS_LABEL, URGENCY_LEVELS } from "@/constants/categories";
import { formatDayTime, formatRelative } from "@/utils/date";
import { formatZMW } from "@/utils/currency";
import type { MaintenanceMessage, MaintenanceRequest, MaintenanceTimelineEvent } from "@/types";

export default function MaintenanceDetails() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [request, setRequest] = useState<MaintenanceRequest | null | undefined>(undefined);
  const [timeline, setTimeline] = useState<MaintenanceTimelineEvent[]>([]);
  const [messages, setMessages] = useState<MaintenanceMessage[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!id) return;
    const unsub1 = subscribeToMaintenanceRequest(id, setRequest);
    const unsub2 = subscribeToTimeline(id, setTimeline);
    const unsub3 = subscribeToMaintenanceMessages(id, setMessages);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [id]);

  async function handleSend() {
    if (!draft.trim() || !profile || !id) return;
    const text = draft.trim();
    setDraft("");
    await sendMaintenanceMessage(id, profile.id, profile.role, text);
  }

  if (request === undefined) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (request === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.textSecondary }}>This request could not be found.</Text>
      </SafeAreaView>
    );
  }

  const category = MAINTENANCE_CATEGORIES.find((c) => c.value === request.category);
  const urgency = URGENCY_LEVELS.find((u) => u.value === request.urgency);
  const canSeeCost = profile?.role !== "tenant" || request.costVisibleToTenant;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 12 }}>
            <ArrowLeft size={22} color={theme.colors.textPrimary} />
          </Pressable>
          <View>
            <Text style={{ ...theme.typography.micro, color: theme.colors.textMuted }}>{request.referenceNumber}</Text>
            <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary }}>{request.title}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, gap: theme.spacing.lg }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Badge label={MAINTENANCE_STATUS_LABEL[request.status]} tone={request.status === "completed" ? "success" : "info"} />
            <Badge label={category ? `${category.emoji} ${category.label}` : request.category} tone="neutral" />
            {urgency ? <Badge label={urgency.label} tone={urgency.color} /> : null}
          </View>

          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>{request.description}</Text>

          {request.photos.length > 0 ? (
            <FlatList
              horizontal
              data={request.photos}
              keyExtractor={(uri) => uri}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width: 120, height: 120, borderRadius: theme.radius.sm, marginRight: 10 }} />
              )}
            />
          ) : null}

          {request.assignment ? (
            <View>
              <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 6 }}>Assigned to</Text>
              <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
                {request.assignment.assignedTo} ({request.assignment.assigneeType.replace("_", " ")})
              </Text>
            </View>
          ) : null}

          {request.scheduledAt ? (
            <View>
              <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 6 }}>Scheduled</Text>
              <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>{formatDayTime(request.scheduledAt)}</Text>
            </View>
          ) : null}

          {canSeeCost && (request.estimatedCost || request.actualCost) ? (
            <View>
              <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 6 }}>Cost</Text>
              {request.estimatedCost ? (
                <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
                  Estimated: {formatZMW(request.estimatedCost)}
                </Text>
              ) : null}
              {request.actualCost ? (
                <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
                  Actual: {formatZMW(request.actualCost)}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 12 }}>Timeline</Text>
            <MaintenanceTimeline events={timeline} currentStatus={request.status} />
          </View>

          <View>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 10 }}>Conversation</Text>
            {messages.length === 0 ? (
              <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>No messages yet.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {messages.map((m) => {
                  const mine = m.senderId === profile?.id;
                  return (
                    <View
                      key={m.id}
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        backgroundColor: mine ? theme.colors.accent : theme.colors.surface,
                        borderWidth: mine ? 0 : 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.md,
                        padding: 12,
                        maxWidth: "85%",
                      }}
                    >
                      <Text style={{ color: mine ? theme.colors.textInverse : theme.colors.textPrimary }}>{m.text}</Text>
                      <Text
                        style={{
                          ...theme.typography.micro,
                          color: mine ? "rgba(255,255,255,0.7)" : theme.colors.textMuted,
                          marginTop: 4,
                        }}
                      >
                        {formatRelative(m.createdAt)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: theme.spacing.md,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a message..."
            placeholderTextColor={theme.colors.textMuted}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 16,
              paddingVertical: 10,
              color: theme.colors.textPrimary,
            }}
          />
          <Pressable
            onPress={handleSend}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={18} color={theme.colors.textInverse} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
