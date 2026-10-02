/**
 * Property status semantics (mirrored by firestore.rules - keep in sync).
 *
 *   pending    submitted, waiting for admin review (a landlord may have MANY at once)
 *   approved   reviewed + listed publicly
 *   vacant     listed publicly and available to tenants (owner-set, after approval)
 *   rented     currently rented - not listed
 *   sold       no longer available - not listed
 *   rejected   admin rejected it
 *   suspended  admin hid it (only an admin can undo this)
 *   inactive   owner switched the listing off
 *
 * "Live" statuses are the ones a listing can only reach through admin approval. An owner
 * may move freely between them (e.g. rented -> vacant when a tenant leaves) but can never
 * ENTER them from pending / inactive / rejected, so the owner can't skip review.
 */
import type { PropertyStatus } from "@/types";

export const ALL_PROPERTY_STATUSES: readonly PropertyStatus[] = [
  "pending",
  "approved",
  "vacant",
  "rented",
  "sold",
  "rejected",
  "suspended",
  "inactive",
];

/** Visible to every tenant in discovery, and open for viewing requests / enquiries. */
export const LISTED_STATUSES = ["approved", "vacant"] as const satisfies readonly PropertyStatus[];

/** Statuses that exist only after admin approval. */
export const LIVE_STATUSES = ["approved", "vacant", "rented", "sold"] as const satisfies readonly PropertyStatus[];

/** The availability statuses an owner can pick on the property page. */
export const OWNER_AVAILABILITY_STATUSES = ["vacant", "rented", "sold"] as const satisfies readonly PropertyStatus[];

export const isListedStatus = (status: PropertyStatus): boolean =>
  (LISTED_STATUSES as readonly string[]).includes(status);

export const isLiveStatus = (status: PropertyStatus): boolean =>
  (LIVE_STATUSES as readonly string[]).includes(status);

/** What an OWNER (not an admin) may change a listing's status to. Admins can set anything. */
const OWNER_TRANSITIONS: Record<PropertyStatus, readonly PropertyStatus[]> = {
  approved: ["vacant", "rented", "sold", "pending", "inactive"],
  vacant: ["rented", "sold", "pending", "inactive"],
  rented: ["vacant", "sold", "pending", "inactive"],
  sold: ["vacant", "rented", "pending", "inactive"],
  pending: ["inactive"],
  inactive: ["pending"],
  rejected: ["pending", "inactive"],
  suspended: [],
};

export function allowedOwnerStatuses(from: PropertyStatus): readonly PropertyStatus[] {
  return OWNER_TRANSITIONS[from] ?? [];
}

export function canOwnerChangeStatus(from: PropertyStatus, to: PropertyStatus): boolean {
  return allowedOwnerStatuses(from).includes(to);
}

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  vacant: "Vacant",
  rented: "Rented",
  sold: "Sold",
  rejected: "Rejected",
  suspended: "Suspended",
  inactive: "Inactive",
};

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export const PROPERTY_STATUS_TONE: Record<PropertyStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  vacant: "success",
  rented: "info",
  sold: "neutral",
  rejected: "danger",
  suspended: "danger",
  inactive: "neutral",
};
