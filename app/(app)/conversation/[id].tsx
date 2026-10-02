import React, { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Send } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { MESSAGE_MAX_LENGTH, getConversation, parseEnquiryConversationId, subscribeToMessages, sendPropertyMessage } from "@/services/messaging.service";
import { buildTenantDisplayName, conversationTitle } from "@/utils/conversation";
import { logError, toUserMessage } from "@/services/errors";
import { useToast } from "@/components/Toast";
import { formatDayTime } from "@/utils/date";
import type { Message } from "@/types";

export default function Conversation() {
  const theme = useTheme();
  const { id, propertyId: propertyIdParam, landlordId: landlordIdParam } = useLocalSearchParams<{
    id: string;
    propertyId?: string;
    landlordId?: string;
  }>();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const sending = useRef(false);
  // The conversation id encodes who is talking to whom about which property.
  const ids = id ? parseEnquiryConversationId(id) : null;
  const propertyId = ids?.propertyId ?? propertyIdParam;
  const landlordId = ids?.landlordId ?? landlordIdParam;
  const tenantId = ids?.tenantId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  // Landlords see the tenant's name (stored on the conversation); tenants keep the generic title.
  const [title, setTitle] = useState("Property enquiry");
  const role = profile?.role;
  useEffect(() => {
    if (!id || !role || role === "tenant") return;
    let cancelled = false;
    getConversation(id).then((c) => {
      if (!cancelled) setTitle(c ? conversationTitle(c, role) : conversationTitle({ context: "property_enquiry" }, role));
    });
    return () => {
      cancelled = true;
    };
  }, [id, role]);

  useEffect(() => {
    if (!id) return;
    return subscribeToMessages(id, setMessages, (e) => logError("conversation.messages", e));
  }, [id]);

  async function handleSend() {
    if (!draft.trim() || !profile || !propertyId || !landlordId || sending.current) return;
    const text = draft.trim();
    // Previously a landlord's reply used their own id as the tenant id, which created a
    // separate thread the tenant never saw. Both parties now write to the id's own thread.
    const threadTenantId = profile.role === "tenant" ? profile.id : tenantId;
    if (!threadTenantId) {
      showToast("We couldn't open this conversation. Please go back and try again.", "error");
      return;
    }
    sending.current = true;
    setDraft("");
    try {
      await sendPropertyMessage(propertyId, threadTenantId, landlordId, profile.id, text, buildTenantDisplayName(profile));
    } catch (error) {
      logError("conversation.send", error);
      setDraft(text); // don't lose what they typed
      showToast(toUserMessage(error, "messaging"), "error");
    } finally {
      sending.current = false;
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 8 }}>
          {title}
        </Text>
        <FlatList
          keyExtractor={(m) => m.id}
          inverted
          data={[...messages].reverse()}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: 8 }}
          renderItem={({ item }) => {
            const mine = item.senderId === profile?.id;
            return (
              <View
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  backgroundColor: mine ? theme.colors.accent : theme.colors.surface,
                  borderRadius: theme.radius.md,
                  borderWidth: mine ? 0 : 1,
                  borderColor: theme.colors.border,
                  padding: 12,
                  maxWidth: "80%",
                }}
              >
                <Text style={{ color: mine ? theme.colors.textInverse : theme.colors.textPrimary }}>{item.text}</Text>
                <Text
                  style={{
                    ...theme.typography.micro,
                    color: mine ? "rgba(255,255,255,0.7)" : theme.colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  {formatDayTime(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />
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
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder="Message the landlord..."
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
