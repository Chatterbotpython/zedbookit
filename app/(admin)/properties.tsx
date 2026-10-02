import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useTheme } from "@/theme";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import {
  approveProperty,
  listPropertiesByStatus,
  reactivateProperty,
  rejectProperty,
  suspendProperty,
} from "@/services/admin.service";
import { formatRent } from "@/utils/currency";
import type { Property, PropertyStatus } from "@/types";
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE } from "@/constants/propertyStatus";
import { logError, toUserMessage } from "@/services/errors";

const TABS: { key: PropertyStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "vacant", label: "Vacant" },
  { key: "rented", label: "Rented" },
  { key: "sold", label: "Sold" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];


// Failures are logged with their Firebase code and shown with friendly copy (see services/errors.ts).

export default function AdminProperties() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [tab, setTab] = useState<PropertyStatus>("pending");
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setProperties(null);
    setError(null);
    listPropertiesByStatus(tab)
      .then(setProperties)
      .catch((e) => {
        setProperties([]);
        logError("admin.properties", e);
        setError(toUserMessage(e, "admin"));
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [tab]);

  async function run(action: () => Promise<void>, successMessage: string, failMessage: string) {
    try {
      await action();
      showToast(successMessage, "success");
      reload();
    } catch (e) {
      logError("admin.propertyAction", e);
      showToast(`${failMessage} ${toUserMessage(e, "admin")}`, "error");
    }
  }

  function confirmDestructive(title: string, message: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: title, style: "destructive", onPress: onConfirm },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Properties
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: active ? theme.colors.accent : theme.colors.surfaceSubtle,
              }}
            >
              <Text
                style={{
                  ...theme.typography.captionMedium,
                  color: active ? theme.colors.textInverse : theme.colors.accent,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Card style={{ padding: 14 }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.danger, marginBottom: 10 }}>{error}</Text>
            <Button label="Retry" variant="outline" size="sm" onPress={reload} />
          </Card>
        </View>
      ) : null}

      <FlatList
        data={properties ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={
          properties !== null && !error ? (
            <EmptyState
              emoji="✅"
              title={`No ${tab} listings.`}
              subtitle={tab === "pending" ? "Nothing waiting for review right now." : "Nothing here at the moment."}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={{ overflow: "hidden", marginBottom: 14 }}>
            <Image source={{ uri: item.photos[0] }} style={{ width: "100%", height: 160 }} contentFit="cover" />
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, flex: 1 }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Badge label={PROPERTY_STATUS_LABEL[item.status]} tone={PROPERTY_STATUS_TONE[item.status]} />
              </View>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
                {formatRent(item.price, item.rentFrequency)} · {item.location.area}, {item.location.city}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 }}>
                Landlord: {item.landlordId}
              </Text>

              {tab === "pending" ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Reject"
                      variant="outline"
                      onPress={() =>
                        confirmDestructive("Reject", `Reject "${item.title}"? The landlord will see it as rejected.`, () =>
                          run(() => rejectProperty(item.id), "Property rejected.", "Couldn't reject this property")
                        )
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Approve"
                      onPress={() => run(() => approveProperty(item.id), "Property approved.", "Couldn't approve this property")}
                    />
                  </View>
                </View>
              ) : null}

              {tab === "approved" || tab === "vacant" ? (
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Suspend"
                    variant="danger"
                    onPress={() =>
                      confirmDestructive(
                        "Suspend",
                        `Suspend "${item.title}"? It will be hidden from tenant search immediately.`,
                        () => run(() => suspendProperty(item.id), "Property suspended.", "Couldn't suspend this property")
                      )
                    }
                  />
                </View>
              ) : null}

              {tab === "rejected" || tab === "suspended" ? (
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Reactivate"
                    onPress={() =>
                      run(() => reactivateProperty(item.id), "Property reactivated.", "Couldn't reactivate this property")
                    }
                  />
                </View>
              ) : null}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
