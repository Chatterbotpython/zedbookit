import React from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, ChevronRight } from "lucide-react-native";
import { Image } from "expo-image";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useTenancy } from "@/hooks/useTenancy";
import { useFavorites } from "@/hooks/useFavorites";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/Skeleton";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { QUICK_CATEGORIES } from "@/constants/categories";
import { DEFAULT_CITY_ID, ZAMBIA_CITIES } from "@/constants/locations";
import { getFeaturedProperties, getNewListings } from "@/services/properties.service";
import type { Property } from "@/types";

const EMPTY_TITLE = "No properties available yet";
const EMPTY_SUBTITLE = "Check back soon — new homes are being added.";

export default function TenantHome() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { hasActiveTenancy, property: homeProperty, isLoading: tenancyLoading } = useTenancy();
  const { favoriteIds, toggleFavorite } = useFavorites();

  const city = ZAMBIA_CITIES.find((c) => c.id === DEFAULT_CITY_ID)!;
  const featuredQ = useAsyncData(() => getFeaturedProperties(city.name), [city.name], { context: "properties" });
  const newQ = useAsyncData(() => getNewListings(city.name), [city.name], { context: "properties" });
  const refreshing = featuredQ.refreshing || newQ.refreshing;
  const refreshAll = () => Promise.all([featuredQ.refresh(), newQ.refresh()]).then(() => undefined);
  const reloadAll = () => Promise.all([featuredQ.reload(), newQ.reload()]).then(() => undefined);
  // Truly empty marketplace = both queries succeeded and returned nothing. That is a normal state, not an error.
  const marketplaceEmpty =
    featuredQ.data !== null && newQ.data !== null && featuredQ.data.length === 0 && newQ.data.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme.colors.accent} />}
      >
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            📍 {city.name}, Zambia
          </Text>
          <Text style={{ ...theme.typography.display, color: theme.colors.textPrimary, marginTop: 4 }}>
            {profile ? `Hi ${profile.firstName},` : "Hi there,"}
            {"\n"}Find a place{"\n"}that feels like home.
          </Text>

          <Pressable
            onPress={() => router.push("/(tenant)/explore")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginTop: theme.spacing.lg,
              gap: 10,
              ...theme.shadow.card,
            }}
          >
            <Search size={18} color={theme.colors.textMuted} />
            <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              Search area, neighbourhood or property...
            </Text>
          </Pressable>
        </View>

        {!tenancyLoading && hasActiveTenancy && homeProperty ? (
          <Pressable onPress={() => router.push("/my-home")} style={{ paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg }}>
            <Card style={{ flexDirection: "row", overflow: "hidden" }}>
              <Image source={{ uri: homeProperty.photos[0] }} style={{ width: 96, height: 96 }} contentFit="cover" />
              <View style={{ flex: 1, padding: 14, justifyContent: "center" }}>
                <Text style={{ ...theme.typography.micro, color: theme.colors.accent }}>MY HOME</Text>
                <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary }} numberOfLines={1}>
                  {homeProperty.title}
                </Text>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>
                  {homeProperty.location.area}, {homeProperty.location.city}
                </Text>
              </View>
              <View style={{ justifyContent: "center", paddingRight: 14 }}>
                <ChevronRight size={20} color={theme.colors.textMuted} />
              </View>
            </Card>
          </Pressable>
        ) : null}

        <View style={{ marginTop: theme.spacing.lg }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={QUICK_CATEGORIES}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: "/(tenant)/explore", params: { quick: item.value } })}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.surfaceSubtle,
                }}
              >
                <Text style={{ ...theme.typography.captionMedium, color: theme.colors.accent }}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>

        {marketplaceEmpty ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <EmptyState emoji="🏡" title={EMPTY_TITLE} subtitle={EMPTY_SUBTITLE} actionLabel="Refresh" onAction={reloadAll} />
          </View>
        ) : (
          <>
            <Section title="Featured homes" onSeeAll={() => router.push("/(tenant)/explore")}>
              <HorizontalPropertyList
                properties={featuredQ.data}
                error={featuredQ.error}
                onRetry={featuredQ.reload}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            </Section>

            <Section title="New listings" onSeeAll={() => router.push("/(tenant)/explore")}>
              <HorizontalPropertyList
                properties={newQ.data}
                error={newQ.error}
                onRetry={newQ.reload}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        }}
      >
        <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary }}>{title}</Text>
        <Pressable onPress={onSeeAll}>
          <Text style={{ ...theme.typography.captionMedium, color: theme.colors.accent }}>See all</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function HorizontalPropertyList({
  properties,
  error,
  onRetry,
  favoriteIds,
  onToggleFavorite,
}: {
  properties: Property[] | null;
  error: string | null;
  onRetry: () => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const theme = useTheme();

  if (properties === null && error) {
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, gap: 8 }}>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>{error}</Text>
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={{ ...theme.typography.captionMedium, color: theme.colors.accent }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (properties === null) {
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, flexDirection: "row", gap: 14 }}>
        <View style={{ width: 240 }}>
          <PropertyCardSkeleton />
        </View>
        <View style={{ width: 240 }}>
          <PropertyCardSkeleton />
        </View>
      </View>
    );
  }

  if (properties.length === 0) {
    return (
      <Text style={{ ...theme.typography.body, color: theme.colors.textMuted, paddingHorizontal: theme.spacing.lg }}>
        Nothing here yet — check back soon.
      </Text>
    );
  }

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={properties}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
      renderItem={({ item }) => (
        <View style={{ width: 240, marginRight: 14 }}>
          <PropertyCard
            property={item}
            isFavorited={favoriteIds.has(item.id)}
            onPress={() => router.push(`/property/${item.id}`)}
            onToggleFavorite={() => onToggleFavorite(item.id)}
          />
        </View>
      )}
    />
  );
}
