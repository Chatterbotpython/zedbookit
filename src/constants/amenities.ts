import type { PropertyAmenities } from "@/types";

export const AMENITY_LABELS: Record<keyof PropertyAmenities, { label: string; emoji: string }> = {
  water: { label: "Water", emoji: "💧" },
  electricity: { label: "Electricity", emoji: "⚡" },
  parking: { label: "Parking", emoji: "🚗" },
  security: { label: "Security", emoji: "🛡️" },
  garden: { label: "Garden", emoji: "🌿" },
  borehole: { label: "Borehole", emoji: "⛲" },
  furnished: { label: "Furnished", emoji: "🛋️" },
  internet: { label: "Internet", emoji: "📶" },
  airConditioning: { label: "Air Conditioning", emoji: "❄️" },
  petFriendly: { label: "Pet Friendly", emoji: "🐾" },
};

export const DEFAULT_AMENITIES: PropertyAmenities = {
  water: false,
  electricity: false,
  parking: false,
  security: false,
  garden: false,
  borehole: false,
  furnished: false,
  internet: false,
  airConditioning: false,
  petFriendly: false,
};
