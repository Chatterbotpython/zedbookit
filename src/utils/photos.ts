/** Pure photo helpers (no React Native / Firebase imports) so they can be unit-tested. */
import { MAX_PROPERTY_PHOTOS } from "@/constants/limits";

export interface PhotoMerge {
  /** Existing selection first, then new ones, de-duplicated and capped. */
  photos: string[];
  /** How many picked photos were skipped because the limit was reached. */
  droppedForLimit: number;
  /** How many picked photos were skipped because they were already selected. */
  duplicates: number;
}

/**
 * Adds newly picked photos to the existing selection WITHOUT discarding what is
 * already there (the previous code sliced the combined list, silently dropping photos).
 */
export function mergePhotoSelection(
  existing: readonly string[],
  picked: readonly string[],
  max: number = MAX_PROPERTY_PHOTOS
): PhotoMerge {
  const photos = [...existing];
  const seen = new Set(existing);
  let droppedForLimit = 0;
  let duplicates = 0;
  for (const uri of picked) {
    if (seen.has(uri)) {
      duplicates++;
      continue;
    }
    if (photos.length >= max) {
      droppedForLimit++;
      continue;
    }
    photos.push(uri);
    seen.add(uri);
  }
  return { photos, droppedForLimit, duplicates };
}

/** How many more photos the picker should allow (never below 1 so the call is valid). */
export function remainingPhotoSlots(currentCount: number, max: number = MAX_PROPERTY_PHOTOS): number {
  return Math.max(0, max - currentCount);
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, preserving result order.
 * Rejects with the first error (remaining queued items are not started).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i] as T, i);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(lanes);
  return results;
}
