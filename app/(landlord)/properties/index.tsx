import React, { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Plus } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { getPropertiesByLandlord } from "@/services/properties.service";
import { formatRent } from "@/utils/currency";
import type { Property } from "@/types";
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE } from "@/constants/propertyStatus";
import { logError, toUserMessage } from "@/services/errors";


export default function LandlordProperties() {
  const theme = useTheme();
  const { profile } = useAuth();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!profile) return;
    setError(null);
    getPropertiesByLandlord(profile.id)
      .then(setProperties)
      .catch((e) => {
        setProperties([]);
        logError("landlord.properties", e);
        setError(toUserMessage(e, "property"));
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [profile?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.lg, paddingBottom: 8 }}>
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>Properties</Text>
        <Pressable
          onPress={() => router.push("/(landlord)/properties/add")}
          style={{ backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, padding: 10 }}
        >
          <Plus size={18} color={theme.colors.textInverse} />
        </Pressable>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Card style={{ padding: 14 }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.danger, marginBottom: 10 }}>{error}</Text>
            <Button label="Retry" variant="outline" size="sm" onPress={load} />
          </Card>
        </View>
      ) : null}

      <FlatList
        data={properties ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 8, flexGrow: 1 }}
        ListEmptyComponent={
          properties !== null ? (
            <EmptyState
              emoji="🏘️"
              title="No properties yet."
              subtitle="Add your first property to start receiving viewing requests."
              actionLabel="Add a property"
              onAction={() => router.push("/(landlord)/properties/add")}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/(landlord)/properties/${item.id}`)}>
            <Card style={{ flexDirection: "row", overflow: "hidden", marginBottom: 12 }}>
              <Image source={{ uri: item.photos[0] }} style={{ width: 90, height: 90 }} contentFit="cover" />
              <View style={{ flex: 1, padding: 12, justifyContent: "center" }}>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
                  {formatRent(item.price, item.rentFrequency)}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <Badge label={PROPERTY_STATUS_LABEL[item.status]} tone={PROPERTY_STATUS_TONE[item.status]} />
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
