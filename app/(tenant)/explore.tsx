import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SlidersHorizontal } from "lucide-react-native";
import { Pressable } from "react-native";
import { useTheme } from "@/theme";
import { useFavorites } from "@/hooks/useFavorites";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/Button";
import { FilterSheet } from "@/components/FilterSheet";
import { searchProperties, type PropertyPage } from "@/services/properties.service";
import { logError, toUserMessage } from "@/services/errors";
import type { Property, PropertyFilters, PropertyType } from "@/types";
import type { DocumentSnapshot } from "firebase/firestore";

function hasFilters(f: PropertyFilters): boolean {
  return Object.values(f).some((v) => (typeof v === "object" && v !== null ? Object.values(v).some(Boolean) : v !== undefined && v !== ""));
}

export default function Explore() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ quick?: string }>();
  const { favoriteIds, toggleFavorite } = useFavorites();

  const [filters, setFilters] = useState<PropertyFilters>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.quick && params.quick !== "furnished") {
      setFilters((f) => ({ ...f, type: params.quick as PropertyType }));
    } else if (params.quick === "furnished") {
      setFilters((f) => ({ ...f, amenities: { ...f.amenities, furnished: true } }));
    }
  }, [params.quick]);

  const [refreshing, setRefreshing] = useState(false);
  // Guards against out-of-order responses (fast filter changes, refresh during paging).
  const requestId = useRef(0);
  const cursorRef = useRef<DocumentSnapshot | null>(null);
  const loadingMoreRef = useRef(false);

  const runSearch = useCallback(async (nextFilters: PropertyFilters, mode: "reset" | "more" | "refresh") => {
    if (mode === "more") {
      if (loadingMoreRef.current) return; // duplicate onEndReached calls
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const mine = ++requestId.current;
    try {
      const page: PropertyPage = await searchProperties(nextFilters, mode === "more" ? cursorRef.current : null);
      if (mine !== requestId.current) return;
      setProperties((prev) => (mode === "more" ? [...prev, ...page.properties] : page.properties));
      cursorRef.current = page.lastDoc;
      setCursor(page.lastDoc);
      setHasMore(page.hasMore);
      setError(null);
    } catch (e) {
      if (mine !== requestId.current) return;
      logError("explore.search", e);
      // Keep whatever is already on screen when paging/refresh fails; only a failed first load shows the error state.
      if (mode !== "more") setProperties([]);
      setError(toUserMessage(e, "properties"));
    } finally {
      if (mine === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (mode === "more") {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void runSearch(filters, "reset");
  }, [filters, runSearch]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>Explore</Text>
        <Pressable
          onPress={() => setFilterSheetOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceSubtle,
          }}
        >
          <SlidersHorizontal size={16} color={theme.colors.accent} />
          <Text style={{ ...theme.typography.captionMedium, color: theme.colors.accent }}>Filters</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          <PropertyCardSkeleton />
          <PropertyCardSkeleton />
          <PropertyCardSkeleton />
        </View>
      ) : error && properties.length === 0 ? (
        <ErrorState message={error} onRetry={() => runSearch(filters, "reset")} />
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 140, flexGrow: 1 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasMore && !loadingMore && runSearch(filters, "more")}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => runSearch(filters, "refresh")} tintColor={theme.colors.accent} />}
          ListEmptyComponent={
            hasFilters(filters) ? (
              <View>
                <EmptyState
                  emoji="🔍"
                  title="No properties match your filters"
                  subtitle="Try widening your filters or checking another area."
                  actionLabel="Clear filters"
                  onAction={() => setFilters({})}
                />
                {hasMore ? (
                  <View style={{ paddingHorizontal: theme.spacing.lg }}>
                    <Button label="Search more listings" variant="outline" onPress={() => runSearch(filters, "more")} loading={loadingMore} />
                  </View>
                ) : null}
              </View>
            ) : (
              <EmptyState
                emoji="🏡"
                title="No properties available yet"
                subtitle="Check back soon — new homes are being added."
                actionLabel="Refresh"
                onAction={() => runSearch(filters, "reset")}
              />
            )
          }
          ListFooterComponent={
            error && properties.length > 0 ? (
              <View style={{ paddingVertical: theme.spacing.md, gap: 8 }}>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: "center" }}>{error}</Text>
                <Button label="Try again" variant="outline" size="sm" onPress={() => runSearch(filters, "more")} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              isFavorited={favoriteIds.has(item.id)}
              onPress={() => router.push(`/property/${item.id}`)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          )}
        />
      )}

      <FilterSheet
        visible={filterSheetOpen}
        initialFilters={filters}
        onClose={() => setFilterSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
