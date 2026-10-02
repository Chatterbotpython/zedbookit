import type { MaintenanceCategory, MaintenanceStatus, MaintenanceUrgency, PropertyType } from "@/types";

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "flat", label: "Flat" },
  { value: "room", label: "Room" },
  { value: "townhouse", label: "Townhouse" },
  { value: "other", label: "Other" },
];

export const QUICK_CATEGORIES: { value: PropertyType | "furnished"; label: string }[] = [
  { value: "house", label: "Houses" },
  { value: "apartment", label: "Apartments" },
  { value: "flat", label: "Flats" },
  { value: "room", label: "Rooms" },
  { value: "furnished", label: "Furnished" },
];

export const MAINTENANCE_CATEGORIES: {
  value: MaintenanceCategory;
  label: string;
  emoji: string;
}[] = [
  { value: "plumbing", label: "Plumbing", emoji: "🚰" },
  { value: "electrical", label: "Electrical", emoji: "💡" },
  { value: "doors_locks", label: "Doors / Locks", emoji: "🚪" },
  { value: "bathroom", label: "Bathroom", emoji: "🚿" },
  { value: "air_conditioning", label: "Air Conditioning", emoji: "❄️" },
  { value: "roof_ceiling", label: "Roof / Ceiling", emoji: "🏠" },
  { value: "windows", label: "Windows", emoji: "🪟" },
  { value: "gas", label: "Gas", emoji: "🔥" },
  { value: "cleaning", label: "Cleaning", emoji: "🧹" },
  { value: "pest_control", label: "Pest Control", emoji: "🐜" },
  { value: "water", label: "Water", emoji: "💧" },
  { value: "power", label: "Power", emoji: "⚡" },
  { value: "general", label: "General", emoji: "🛠" },
  { value: "other", label: "Other", emoji: "❓" },
];

export const URGENCY_LEVELS: {
  value: MaintenanceUrgency;
  label: string;
  description: string;
  color: "info" | "success" | "warning" | "danger";
}[] = [
  { value: "low", label: "Low", description: "Minor cosmetic issue — no rush.", color: "info" },
  { value: "normal", label: "Normal", description: "e.g. a broken cupboard handle.", color: "success" },
  { value: "high", label: "High", description: "e.g. a leaking pipe that needs prompt attention.", color: "warning" },
  {
    value: "emergency",
    label: "Emergency",
    description: "Major flooding, electrical danger, or a security/lock emergency. We'll flag this for immediate attention.",
    color: "danger",
  },
];

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  assigned: "Technician assigned",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  waiting_for_parts: "Waiting for Parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MAINTENANCE_STATUS_ORDER = [
  "submitted",
  "under_review",
  "assigned",
  "scheduled",
  "in_progress",
  "waiting_for_parts",
  "completed",
] as const;
