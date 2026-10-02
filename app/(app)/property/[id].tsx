import React, { useEffect } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Heart, MessageCircle } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";
import { PropertyGallery } from "@/components/PropertyGallery";
import { Button } from "@/components/Button";
import { Badge, VerifiedBadge } from "@/components/Badge";
import { ErrorState } from "@/components/ErrorState";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AMENITY_LABELS } from "@/constants/amenities";
import { PROPERTY_TYPES } from "@/constants/categories";
import { formatRent } from "@/utils/currency";
import { isListedStatus } from "@/constants/propertyStatus";
import { getProperty, incrementPropertyViewCount } from "@/services/properties.service";

export default function PropertyDetails() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const { data: property, loading, error, reload } = useAsyncData(() => getProperty(id as string), [id], {
    enabled: !!id,
    context: "property",
  });
  const loadedId = property?.id;

  useEffect(() => {
    if (loadedId) void incrementPropertyViewCount(loadedId);
  }, [loadedId]);

  if (loading) return <FullScreenLoader />;

  if (error && !property) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center" }}>
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!property) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", gap: 12, padding: theme.spacing.lg }}>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
          This listing is no longer available.
        </Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.accent }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const typeLabel = PROPERTY_TYPES.find((t) => t.value === property.type)?.label ?? property.type;
  const activeAmenities = (Object.keys(AMENITY_LABELS) as (keyof typeof AMENITY_LABELS)[]).filter(
    (key) => property.amenities[key]
  );
  const isOwnProperty = profile?.id === property.landlordId;
  const canRequestViewing = isListedStatus(property.status) && !isOwnProperty;
  const locationLine = [
    property.location.hideExactAddress ? property.location.area : property.location.address ?? property.location.area,
    property.location.city,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View>
          <PropertyGallery photos={property.photos} />
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              top: 56,
              left: 16,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(11,14,18,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
          {!isOwnProperty ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save property"
              onPress={() => toggleFavorite(property.id)}
              style={{
                position: "absolute",
                top: 56,
                right: 16,
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: "rgba(11,14,18,0.45)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Heart size={18} color="#fff" fill={favoriteIds.has(property.id) ? "#fff" : "transparent"} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ padding: theme.spacing.lg }}>
          <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>{property.title}</Text>
          <Text style={{ ...theme.typography.h2, color: theme.colors.accent, marginTop: 6 }}>
            {formatRent(property.price, property.rentFrequency)}
          </Text>
          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4 }}>
            📍 {locationLine || "Location to be confirmed"}
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {property.isVerified ? <VerifiedBadge /> : null}
            <Badge label={typeLabel} tone="neutral" />
          </View>

          <View
            style={{
              flexDirection: "row",
              marginTop: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.divider,
            }}
          >
            <Stat label="Bedrooms" value={String(property.bedrooms)} />
            <Stat label="Bathrooms" value={String(property.bathrooms)} />
            <Stat label="Parking" value={String(property.parkingSpaces)} />
          </View>

          <Section title="Amenities">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {activeAmenities.length === 0 ? (
                <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>Not specified.</Text>
              ) : (
                activeAmenities.map((key) => (
                  <View
                    key={key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: theme.colors.surfaceSubtle,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: theme.radius.pill,
                    }}
                  >
                    <Text>{AMENITY_LABELS[key].emoji}</Text>
                    <Text style={{ ...theme.typography.caption, color: theme.colors.textPrimary }}>
                      {AMENITY_LABELS[key].label}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </Section>

          <Section title="Description">
            <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, lineHeight: 22 }}>
              {property.description || "No description provided."}
            </Text>
          </Section>

          <Section title="Location">
            <View
              style={{
                height: 140,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                Map view coming soon — {locationLine || "location to be confirmed"}
              </Text>
            </View>
          </Section>
        </View>
      </ScrollView>

      {canRequestViewing ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            gap: 10,
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              label="Message"
              variant="outline"
              icon={<MessageCircle size={18} color={theme.colors.textPrimary} />}
              onPress={() =>
                router.push(
                  `/conversation/enquiry_${property.id}_${profile?.id}_${property.landlordId}?propertyId=${property.id}&landlordId=${property.landlordId}`
                )
              }
            />
          </View>
          <View style={{ flex: 1.2 }}>
            <Button label="Request Viewing" onPress={() => router.push(`/viewing-request/${property.id}`)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary }}>{value}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}
