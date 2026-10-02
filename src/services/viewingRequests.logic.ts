/**
 * Pure viewing-request rules (no Firebase imports) so they can be unit-tested
 * and mirrored 1:1 by firestore.rules.
 *
 * State machine:
 *   pending  --tenant-->    cancelled
 *   pending  --landlord-->  accepted | declined
 *   accepted --tenant-->    cancelled
 *   accepted --landlord-->  completed | cancelled
 *   declined / cancelled / completed are terminal.
 * A viewing can only be marked completed once its slot time has been reached.
 */
import { addDays, format, isValid, parse } from "date-fns";
import {
  VIEWING_EARLIEST_TIME,
  VIEWING_LATEST_TIME,
  VIEWING_MAX_DAYS_AHEAD,
  VIEWING_MESSAGE_MAX_LENGTH,
  VIEWING_QUICK_TIMES,
} from "@/constants/viewing";
import type { ViewingRequestStatus } from "@/types";

export type ViewingActor = "tenant" | "landlord";

const TRANSITIONS: Record<ViewingActor, Partial<Record<ViewingRequestStatus, ViewingRequestStatus[]>>> = {
  tenant: { pending: ["cancelled"], accepted: ["cancelled"] },
  landlord: { pending: ["accepted", "declined"], accepted: ["completed", "cancelled"] },
};

export function isTerminalViewingStatus(status: ViewingRequestStatus): boolean {
  return status === "declined" || status === "cancelled" || status === "completed";
}

/** Local start time of the slot, or null if the stored date/time is unusable. */
export function slotStart(requestedDate: string, requestedTime: string): Date | null {
  const d = parseCalendarDate(requestedDate);
  const m = /^(\d{2}):(\d{2})$/.exec(requestedTime);
  if (!d || !m) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2]), 0, 0);
}

/** Completion is allowed only after the viewing was due to start. Unknown slots don't block. */
export function canMarkCompleted(requestedDate: string, requestedTime: string, now: Date = new Date()): boolean {
  const start = slotStart(requestedDate, requestedTime);
  return !start || start.getTime() <= now.getTime();
}

export function canTransition(actor: ViewingActor, from: ViewingRequestStatus, to: ViewingRequestStatus): boolean {
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

export function allowedTransitions(actor: ViewingActor, from: ViewingRequestStatus): ViewingRequestStatus[] {
  return TRANSITIONS[actor][from] ?? [];
}

export function isActiveViewingStatus(status: ViewingRequestStatus): boolean {
  return status === "pending" || status === "accepted";
}

export interface ViewingSlotInput {
  requestedDate: string;
  requestedTime: string;
  message?: string;
}

export type ViewingValidation = { ok: true } | { ok: false; reason: string };

/** Calendar date strictly in "yyyy-MM-dd" form (rejects 2026-02-31, "tomorrow", etc.). */
export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parse(value, "yyyy-MM-dd", new Date(0));
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value ? parsed : null;
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Strict 24-hour "HH:mm" (rejects "9:30", "24:00", "12:60", "noon"). */
export function isValidTimeOfDay(value: string): boolean {
  return TIME_OF_DAY.test(value);
}

/** Allowed window for a viewing (inclusive), mirrored in firestore.rules. */
export function isWithinViewingHours(time: string): boolean {
  return isValidTimeOfDay(time) && time >= VIEWING_EARLIEST_TIME && time <= VIEWING_LATEST_TIME;
}

/**
 * Live formatter for a typed time: keeps digits only and inserts the colon, so typing
 * "1315" shows "13:15". A first digit of 3-9 can only be a single-digit hour, so it is
 * zero-padded ("9" -> "09", then "30" -> "09:30"). Never returns more than 5 characters.
 */
export function formatTimeInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 0 && digits[0]! > "2") digits = `0${digits}`;
  digits = digits.slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Turns "9:30" / "930" / "09:30" into "09:30"; returns null if it can't be read as a time. */
export function normalizeTimeInput(raw: string): string | null {
  const text = raw.trim();
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  const compact = /^(\d{1,2})(\d{2})$/.exec(text);
  const m = colon ?? compact;
  if (!m) return null;
  const candidate = `${m[1]!.padStart(2, "0")}:${m[2]}`;
  return isValidTimeOfDay(candidate) ? candidate : null;
}

export function validateViewingSlot(input: ViewingSlotInput, now: Date = new Date()): ViewingValidation {
  const date = parseCalendarDate(input.requestedDate);
  if (!date) return { ok: false, reason: "Please choose a valid date." };
  if (!isValidTimeOfDay(input.requestedTime)) {
    return { ok: false, reason: "Enter the time as 24-hour HH:mm, for example 13:15." };
  }
  if (!isWithinViewingHours(input.requestedTime)) {
    return {
      ok: false,
      reason: `Viewings can be requested between ${VIEWING_EARLIEST_TIME} and ${VIEWING_LATEST_TIME}.`,
    };
  }

  const today = format(now, "yyyy-MM-dd");
  const last = format(addDays(now, VIEWING_MAX_DAYS_AHEAD), "yyyy-MM-dd");
  if (input.requestedDate < today) return { ok: false, reason: "That date has already passed." };
  if (input.requestedDate > last) {
    return { ok: false, reason: `You can book up to ${VIEWING_MAX_DAYS_AHEAD} days ahead.` };
  }
  if (input.requestedDate === today) {
    const nowHm = format(now, "HH:mm");
    if (input.requestedTime <= nowHm) return { ok: false, reason: "That time has already passed today." };
  }
  if ((input.message ?? "").length > VIEWING_MESSAGE_MAX_LENGTH) {
    return { ok: false, reason: `Please keep your message under ${VIEWING_MESSAGE_MAX_LENGTH} characters.` };
  }
  return { ok: true };
}

/** Quick-pick chips still worth showing on `dateIso` (hides ones that already passed today). */
export function quickTimesFor(dateIso: string | null, now: Date = new Date()): string[] {
  if (!dateIso || dateIso !== format(now, "yyyy-MM-dd")) return [...VIEWING_QUICK_TIMES];
  const nowHm = format(now, "HH:mm");
  return VIEWING_QUICK_TIMES.filter((t) => t > nowHm);
}

/**
 * Deterministic id: the same tenant asking for the same property/date/time is
 * the same document, so a double-tap or retry can never create duplicates.
 * `attempt` > 1 is used only to allow re-requesting a slot after a previous
 * request for it was cancelled/declined.
 */
export function buildViewingRequestId(
  tenantId: string,
  propertyId: string,
  requestedDate: string,
  requestedTime: string,
  attempt = 1
): string {
  const base = `${tenantId}_${propertyId}_${requestedDate}_${requestedTime.replace(":", "")}`;
  return attempt <= 1 ? base : `${base}_${attempt}`;
}

/** One lock document per (tenant, property): enforces a single active request server-side. */
export function buildViewingLockId(tenantId: string, propertyId: string): string {
  return `${tenantId}_${propertyId}`;
}
