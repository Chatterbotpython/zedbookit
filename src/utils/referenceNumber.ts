/**
 * Generates a human-friendly maintenance reference number, e.g. "ZB-2026-00482".
 * The sequence portion is produced server-side (Cloud Function counter or a
 * Firestore transaction against a `counters/maintenance` doc) so numbers never
 * collide across concurrent submissions; this helper is the display-side format
 * plus a client-side fallback for optimistic UI before the server value returns.
 */
export function formatReferenceNumber(year: number, sequence: number): string {
  return `ZB-${year}-${String(sequence).padStart(5, "0")}`;
}

export function optimisticReferenceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return formatReferenceNumber(year, rand);
}
