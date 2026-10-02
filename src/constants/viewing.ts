/**
 * Viewing requests: tenants choose their own time of day (24h "HH:mm", local time).
 * The accepted window is mirrored in firestore.rules - keep in sync.
 */
export const VIEWING_EARLIEST_TIME = "06:00";
export const VIEWING_LATEST_TIME = "20:00";

/** Convenience chips only. These are suggestions, NOT a whitelist - any valid time in the window works. */
export const VIEWING_QUICK_TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"] as const;

/** How far ahead a tenant may book, in days. */
export const VIEWING_MAX_DAYS_AHEAD = 60;
export const VIEWING_MESSAGE_MAX_LENGTH = 500;
