import { Timestamp } from "firebase/firestore";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import type { FirestoreDate } from "@/types";

/**
 * Converts any date-like value Firestore/JS may hand us into a JS Date.
 * Accepts Timestamp, Date, {seconds,nanoseconds} plain objects (e.g. values
 * that crossed a serialisation boundary), ISO strings and epoch millis.
 * Returns null for anything unusable so callers never crash on old/odd data.
 */
export function toJsDate(value: FirestoreDate | string | number | undefined | null): Date | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "string") {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  const maybe = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") {
    const d = maybe.toDate();
    return isValid(d) ? d : null;
  }
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

export function formatRelative(value: FirestoreDate | undefined | null): string {
  const date = toJsDate(value);
  if (!date) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatDayTime(value: FirestoreDate | undefined | null): string {
  const date = toJsDate(value);
  if (!date) return "";
  return format(date, "d MMM, HH:mm");
}

export function formatDayOnly(value: FirestoreDate | undefined | null): string {
  const date = toJsDate(value);
  if (!date) return "";
  return format(date, "d MMM yyyy");
}

/**
 * Formats a plain "yyyy-MM-dd" calendar date (as stored on viewing requests)
 * WITHOUT timezone drift. `new Date("2026-10-05")` is parsed as UTC midnight,
 * which displays as the previous day west of UTC; parseISO treats a date-only
 * string as local time.
 */
export function formatCalendarDate(isoDate: string | undefined | null): string {
  if (!isoDate) return "";
  const parsed = parseISO(isoDate);
  return isValid(parsed) ? format(parsed, "EEE d MMM yyyy") : "";
}

/** Sorting helper: newest first, tolerant of missing/pending server timestamps. */
export function compareByCreatedAtDesc(a: { createdAt?: FirestoreDate | null }, b: { createdAt?: FirestoreDate | null }): number {
  const ta = toJsDate(a.createdAt ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER; // pending writes = newest
  const tb = toJsDate(b.createdAt ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return tb - ta;
}
