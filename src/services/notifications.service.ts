import {
  addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, Unsubscribe, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { AppNotification, NotificationType } from "@/types";

const notificationsRef = collection(db, "notifications");

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Writes the in-app notification document. In production this would be
 * mirrored by a Cloud Function that also sends the FCM push (see
 * `src/services/push.service.ts` and the README's "Cloud Functions" section)
 * — the client only ever needs to write this Firestore doc.
 */
export async function createNotification(input: NewNotification): Promise<void> {
  await addDoc(notificationsRef, {
    ...input,
    isRead: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    notificationsRef,
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification));
    },
    (error) => onError?.(error)
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, "notifications", id), { isRead: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(
    query(notificationsRef, where("userId", "==", userId), where("isRead", "==", false))
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}
