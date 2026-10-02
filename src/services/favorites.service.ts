import {
  collection, doc, getDocs, query, runTransaction, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Favorite } from "@/types";

/** Favorite doc id is deterministic (`${userId}_${propertyId}`) so toggling
 * never needs an extra query to check "does this already exist". */
function favoriteId(userId: string, propertyId: string) {
  return `${userId}_${propertyId}`;
}

export async function isFavorited(userId: string, propertyId: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, "favorites"), where("userId", "==", userId), where("propertyId", "==", propertyId))
  );
  return !snap.empty;
}

export async function addFavorite(userId: string, propertyId: string): Promise<void> {
  const favoriteRef = doc(db, "favorites", favoriteId(userId, propertyId));
  const propertyRef = doc(db, "properties", propertyId);

  await runTransaction(db, async (tx) => {
    const [favoriteSnap, propertySnap] = await Promise.all([tx.get(favoriteRef), tx.get(propertyRef)]);
    if (!propertySnap.exists()) throw new Error("property-not-found");
    if (favoriteSnap.exists()) return;

    const savedCount = Number(propertySnap.data().savedCount ?? 0);
    tx.set(favoriteRef, {
      userId,
      propertyId,
      createdAt: serverTimestamp(),
    });
    tx.update(propertyRef, { savedCount: savedCount + 1 });
  });
}

export async function removeFavorite(userId: string, propertyId: string): Promise<void> {
  const favoriteRef = doc(db, "favorites", favoriteId(userId, propertyId));
  const propertyRef = doc(db, "properties", propertyId);

  await runTransaction(db, async (tx) => {
    const [favoriteSnap, propertySnap] = await Promise.all([tx.get(favoriteRef), tx.get(propertyRef)]);
    if (!favoriteSnap.exists()) return;
    if (!propertySnap.exists()) {
      tx.delete(favoriteRef);
      return;
    }

    const savedCount = Math.max(0, Number(propertySnap.data().savedCount ?? 0));
    tx.delete(favoriteRef);
    tx.update(propertyRef, { savedCount: Math.max(0, savedCount - 1) });
  });
}

export async function getFavoritePropertyIds(userId: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "favorites"), where("userId", "==", userId)));
  return snap.docs.map((d) => (d.data() as Favorite).propertyId);
}
