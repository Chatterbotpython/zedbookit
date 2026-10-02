import React, { useEffect, useState } from "react";
import { FlatList, Pressable, Text } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { logError, toUserMessage } from "@/services/errors";
import { subscribeToConversations } from "@/services/messaging.service";
import { formatRelative } from "@/utils/date";
import { conversationTitle } from "@/utils/conversation";
import type { Conversation } from "@/types";

export default function LandlordMessages() {
  const theme = useTheme();
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = profile?.id;

  useEffect(() => {
    if (!userId) return;
    return subscribeToConversations(
      userId,
      (items) => {
        setError(null);
        setConversations(items);
      },
      (e) => {
        logError("landlord.messages", e);
        setError(toUserMessage(e, "messaging"));
      }
    );
  }, [userId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Messages
      </Text>
      {error && conversations === null ? <ErrorState message={error} /> : null}
      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={
          conversations !== null ? <EmptyState emoji="💬" title="No messages yet." subtitle="Tenant enquiries about your properties will appear here." /> : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push(`/conversation/${item.id}?propertyId=${item.propertyId ?? ""}&landlordId=${profile?.id ?? ""}`)
            }
          >
            <Card style={{ padding: 14, marginBottom: 10 }}>
              <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>
                {conversationTitle(item, profile?.role)}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                {item.lastMessage ?? "No messages yet"}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 4 }}>
                {formatRelative(item.lastMessageAt)}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
