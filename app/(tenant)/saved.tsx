import React from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useFavorites } from "@/hooks/useFavorites";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProperty } from "@/services/properties.service";
import { isListedStatus } from "@/constants/propertyStatus";
import type { Property } from "@/types";

export default function Saved() {
  const theme = useTheme();
  const { favoriteIds, isLoading: favoritesLoading, toggleFavorite, reload: reloadFavorites } = useFavorites();
  const idsKey = [...favoriteIds].sort().join(",");

  // One unreadable/removed listing must not take the whole list down: load each independently
  // and quietly drop the ones that are gone (sold, suspended, deleted).
  const saved = useAsyncData(
    async () => {
      const results = await Promise.allSettled([...favoriteIds].map((id) => getProperty(id)));
      const found: Property[] = [];
      let failures = 0;
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value && isListedStatus(r.value.status)) found.push(r.value);
        } else failures += 1;
      }
      if (failures > 0 && found.length === 0) throw new Error("network-request-failed");
      return found;
    },
    [idsKey],
    { enabled: !favoritesLoading, context: "properties" }
  );
  const properties = saved.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Your saved homes
      </Text>

      {saved.error && properties === null ? (
        <ErrorState message={saved.error} onRetry={() => { void reloadFavorites(); void saved.reload(); }} />
      ) : properties === null || favoritesLoading ? (
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          <PropertyCardSkeleton />
          <PropertyCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={saved.refreshing} onRefresh={() => { void reloadFavorites(); void saved.refresh(); }} tintColor={theme.colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              emoji="🤍"
              title="No saved homes yet."
              subtitle="Tap the heart on any property to save it here for later."
              actionLabel="Explore homes"
              onAction={() => router.push("/(tenant)/explore")}
            />
          }
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              isFavorited
              onPress={() => router.push(`/property/${item.id}`)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
