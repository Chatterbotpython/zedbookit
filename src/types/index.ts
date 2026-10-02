/**
 * ZedBookIt centralized domain types.
 * These mirror the Firestore collections described in the architecture:
 * users, properties, tenancies, viewingRequests, maintenanceRequests,
 * maintenanceMessages, maintenanceAssignments, conversations, messages,
 * favorites, notifications, reports.
 */

import type { Timestamp } from "firebase/firestore";

/** Firestore timestamps arrive as Timestamp objects; we accept either
 * a Timestamp (server data) or a Date (freshly constructed client data). */
export type FirestoreDate = Timestamp | Date;

export type UserRole = "tenant" | "landlord" | "agent" | "admin";

export interface UserProfile {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string; // stored in +260 format
  photoURL?: string;
  city?: string;
  isSuspended: boolean;
  fcmTokens?: string[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type PropertyType = "house" | "apartment" | "flat" | "room" | "townhouse" | "other";

export type RentFrequency = "monthly" | "weekly" | "daily";

export type PropertyStatus =
  | "pending"
  | "approved"
  | "vacant"
  | "rented"
  | "sold"
  | "rejected"
  | "suspended"
  | "inactive";

export interface PropertyAmenities {
  water: boolean;
  electricity: boolean;
  parking: boolean;
  security: boolean;
  garden: boolean;
  borehole: boolean;
  furnished: boolean;
  internet: boolean;
  airConditioning: boolean;
  petFriendly: boolean;
}

export interface PropertyLocation {
  province: string;
  city: string; // e.g. Lusaka, Kitwe, Ndola...
  area: string; // neighbourhood e.g. Chalala
  address?: string; // exact address, may be hidden from public
  hideExactAddress: boolean;
  latitude?: number;
  longitude?: number;
}

export interface Property {
  id: string;
  landlordId: string;
  managedByAgentId?: string;
  type: PropertyType;
  title: string;
  description: string;
  price: number; // in ZMW
  currency: "ZMW";
  rentFrequency: RentFrequency;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  amenities: PropertyAmenities;
  location: PropertyLocation;
  photos: string[]; // storage download URLs, [0] is main photo
  status: PropertyStatus;
  isVerified: boolean;
  viewCount: number;
  savedCount: number;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type TenancyStatus = "pending" | "active" | "ended" | "cancelled";

export interface Tenancy {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  startDate: FirestoreDate;
  endDate?: FirestoreDate;
  status: TenancyStatus;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type ViewingRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed";

export interface ViewingRequest {
  id: string;
  propertyId: string;
  tenantId: string;
  landlordId: string;
  requestedDate: string; // ISO date (yyyy-MM-dd)
  requestedTime: string; // e.g. "14:00"
  message?: string;
  /** Denormalised at creation so landlords/agents can list requests without reading other users' profiles. */
  propertyTitle?: string;
  tenantName?: string;
  status: ViewingRequestStatus;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type MaintenanceCategory =
  | "plumbing"
  | "electrical"
  | "doors_locks"
  | "bathroom"
  | "air_conditioning"
  | "roof_ceiling"
  | "windows"
  | "gas"
  | "cleaning"
  | "pest_control"
  | "water"
  | "power"
  | "general"
  | "other";

export type MaintenanceUrgency = "low" | "normal" | "high" | "emergency";

export type MaintenanceStatus =
  | "submitted"
  | "under_review"
  | "assigned"
  | "scheduled"
  | "in_progress"
  | "waiting_for_parts"
  | "completed"
  | "cancelled";

export type AssigneeType = "self" | "external_technician" | "maintenance_worker";

export interface MaintenanceAssignment {
  assignedTo: string; // name of technician/person
  assigneeType: AssigneeType;
  assignedBy: string; // userId of landlord/agent
  assignedAt: FirestoreDate;
  contactPhone?: string;
}

export interface MaintenanceRequest {
  id: string;
  referenceNumber: string; // e.g. ZB-2026-00482
  propertyId: string;
  tenancyId: string;
  tenantId: string;
  landlordId: string;
  category: MaintenanceCategory;
  title: string;
  description: string;
  urgency: MaintenanceUrgency;
  status: MaintenanceStatus;
  photos: string[];
  videoUrl?: string;
  preferredAccessTime?: string;
  assignment?: MaintenanceAssignment;
  scheduledAt?: FirestoreDate;
  estimatedCost?: number;
  actualCost?: number;
  currency?: "ZMW";
  invoiceReference?: string;
  costVisibleToTenant: boolean;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  completedAt?: FirestoreDate;
}

export interface MaintenanceTimelineEvent {
  id: string;
  maintenanceRequestId: string;
  status: MaintenanceStatus;
  note?: string;
  actorId: string;
  createdAt: FirestoreDate;
}

export interface MaintenanceMessage {
  id: string;
  maintenanceRequestId: string;
  senderId: string;
  senderRole: UserRole;
  text: string;
  createdAt: FirestoreDate;
}

export type ConversationContext = "property_enquiry" | "maintenance";

export interface Conversation {
  id: string;
  context: ConversationContext;
  propertyId?: string;
  maintenanceRequestId?: string;
  participantIds: string[];
  /** Display name of the tenant who started a property enquiry (name only - no other profile data). */
  tenantName?: string;
  lastMessage?: string;
  lastMessageAt?: FirestoreDate;
  createdAt?: FirestoreDate;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: FirestoreDate;
  readBy: string[];
}

export interface Favorite {
  id: string;
  userId: string;
  propertyId: string;
  createdAt: FirestoreDate;
}

export type NotificationType =
  | "viewing_accepted"
  | "viewing_declined"
  | "viewing_cancelled"
  | "viewing_completed"
  | "new_message"
  | "maintenance_received"
  | "maintenance_updated"
  | "technician_assigned"
  | "maintenance_scheduled"
  | "maintenance_completed"
  | "new_viewing_request"
  | "new_tenant_message"
  | "new_maintenance_request"
  | "tenant_replied"
  | "urgency_changed"
  | "property_approved"
  | "property_rejected";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  isRead: boolean;
  createdAt: FirestoreDate;
}

export type ReportTargetType = "user" | "property";

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  status: "open" | "reviewed" | "dismissed";
  createdAt: FirestoreDate;
}

export interface PropertyFilters {
  city?: string;
  area?: string;
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: Partial<PropertyAmenities>;
}
