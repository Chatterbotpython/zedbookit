import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, getFavoritePropertyIds, removeFavorite } from "@/services/favorites.service";
import { logError } from "@/services/errors";

export function useFavorites() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef<Set<string>>(new Set()); // ids with a write in flight (double-tap guard)
  const idsRef = useRef(favoriteIds);
  idsRef.current = favoriteIds;

  const reload = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const ids = await getFavoritePropertyIds(userId);
      setFavoriteIds(new Set(ids));
      setError(false);
    } catch (e) {
      // Saved homes are secondary; a failure must not block the screen or leave it loading forever.
      logError("useFavorites.reload", e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleFavorite = useCallback(
    async (propertyId: string) => {
      if (!userId || pending.current.has(propertyId)) return;
      pending.current.add(propertyId);
      const isFav = idsRef.current.has(propertyId);
      // optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(propertyId);
        else next.add(propertyId);
        return next;
      });
      try {
        if (isFav) await removeFavorite(userId, propertyId);
        else await addFavorite(userId, propertyId);
      } catch (e) {
        logError("useFavorites.toggle", e);
        await reload(); // revert to server truth
      } finally {
        pending.current.delete(propertyId);
      }
    },
    [userId, reload]
  );

  return { favoriteIds, isLoading, error, toggleFavorite, reload };
}
