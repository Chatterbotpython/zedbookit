import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToNotifications } from "@/services/notifications.service";
import { logError } from "@/services/errors";
import type { AppNotification } from "@/types";

export function useNotifications() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(
      userId,
      (items) => {
        setError(false);
        setNotifications(items);
      },
      (e) => {
        logError("useNotifications", e);
        setError(true);
      }
    );
    return unsubscribe;
  }, [userId]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  return { notifications, unreadCount, error };
}
