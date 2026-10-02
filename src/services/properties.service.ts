import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type {
  Property,
  PropertyAmenities,
  PropertyFilters,
  PropertyLocation,
  PropertyStatus,
  PropertyType,
  RentFrequency,
} from "@/types";
import { compareByCreatedAtDesc } from "@/utils/date";
import { ALL_PROPERTY_STATUSES, LISTED_STATUSES } from "@/constants/propertyStatus";
import { getErrorCode, isMissingIndexError, logError } from "./errors";

export const PAGE_SIZE = 12;
/** Upper bound on Firestore round trips used to fill ONE page when client-side filters discard rows. */
const MAX_FETCHES_PER_PAGE = 5;
const propertiesRef = collection(db, "properties");

export interface PropertyPage {
  properties: Property[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

const AMENITY_KEYS: (keyof PropertyAmenities)[] = [
  "water", "electricity", "parking", "security", "garden",
  "borehole", "furnished", "internet", "airConditioning", "petFriendly",
];
const PROPERTY_TYPES_SET = new Set<PropertyType>(["house", "apartment", "flat", "room", "townhouse", "other"]);
const RENT_FREQUENCIES = new Set<RentFrequency>(["monthly", "weekly", "daily"]);
const STATUSES = new Set<PropertyStatus>(ALL_PROPERTY_STATUSES);

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * Defensive parse of a properties/{id} document. Older/partial documents (no
 * amenities, no photos, no location...) must never crash a screen, so every
 * field gets a safe default here and the UI can rely on the `Property` shape.
 */
export function normalizeProperty(id: string, data: Record<string, unknown>): Property {
  const rawAmenities = (data.amenities ?? {}) as Record<string, unknown>;
  const amenities = Object.fromEntries(AMENITY_KEYS.map((k) => [k, rawAmenities[k] === true])) as unknown as PropertyAmenities;

  const rawLocation = (data.location ?? {}) as Record<string, unknown>;
  const location: PropertyLocation = {
    province: str(rawLocation.province),
    city: str(rawLocation.city),
    area: str(rawLocation.area),
    address: typeof rawLocation.address === "string" ? rawLocation.address : undefined,
    hideExactAddress: rawLocation.hideExactAddress !== false,
    latitude: typeof rawLocation.latitude === "number" ? rawLocation.latitude : undefined,
    longitude: typeof rawLocation.longitude === "number" ? rawLocation.longitude : undefined,
  };

  return {
    id,
    landlordId: str(data.landlordId),
    managedByAgentId: typeof data.managedByAgentId === "string" ? data.managedByAgentId : undefined,
    type: PROPERTY_TYPES_SET.has(data.type as PropertyType) ? (data.type as PropertyType) : "other",
    title: str(data.title, "Untitled property"),
    description: str(data.description),
    price: num(data.price),
    currency: "ZMW",
    rentFrequency: RENT_FREQUENCIES.has(data.rentFrequency as RentFrequency) ? (data.rentFrequency as RentFrequency) : "monthly",
    bedrooms: num(data.bedrooms),
    bathrooms: num(data.bathrooms),
    parkingSpaces: num(data.parkingSpaces),
    amenities,
    location,
    photos: Array.isArray(data.photos) ? data.photos.filter((p): p is string => typeof p === "string" && p.length > 0) : [],
    status: STATUSES.has(data.status as PropertyStatus) ? (data.status as PropertyStatus) : "pending",
    isVerified: data.isVerified === true,
    viewCount: num(data.viewCount),
    savedCount: num(data.savedCount),
    createdAt: data.createdAt as Property["createdAt"],
    updatedAt: data.updatedAt as Property["updatedAt"],
  };
}

/**
 * Filters that are applied in the app after the (index-backed) Firestore query.
 * Firestore can't combine these with `orderBy(createdAt)` without a composite
 * index per combination (and inequality filters force a different sort order),
 * so only status/city/type go to the server — see firestore.indexes.json.
 */
export function applyClientFilters(properties: Property[], filters: PropertyFilters): Property[] {
  return properties.filter((p) => {
    if (filters.area && p.location.area !== filters.area) return false;
    if (typeof filters.bedrooms === "number" && p.bedrooms < filters.bedrooms) return false;
    if (typeof filters.bathrooms === "number" && p.bathrooms < filters.bathrooms) return false;
    if (typeof filters.minPrice === "number" && p.price < filters.minPrice) return false;
    if (typeof filters.maxPrice === "number" && p.price > filters.maxPrice) return false;
    if (filters.amenities) {
      for (const [key, wanted] of Object.entries(filters.amenities)) {
        if (wanted && !p.amenities[key as keyof PropertyAmenities]) return false;
      }
    }
    return true;
  });
}

export function needsClientFiltering(filters: PropertyFilters): boolean {
  return (
    !!filters.area ||
    typeof filters.bedrooms === "number" ||
    typeof filters.bathrooms === "number" ||
    typeof filters.minPrice === "number" ||
    typeof filters.maxPrice === "number" ||
    Object.values(filters.amenities ?? {}).some(Boolean)
  );
}

export interface RawPage {
  docs: { id: string; data: Record<string, unknown>; snapshot: DocumentSnapshot }[];
}
export type PageFetcher = (cursor: DocumentSnapshot | null, pageSize: number) => Promise<RawPage>;

/**
 * Core paging logic, independent of Firestore so it can be unit-tested:
 * keeps fetching server pages until it has a full page of rows that survive the
 * client-side filters, or the collection is exhausted. Zero results is a normal
 * outcome (returns an empty page, never throws).
 */
export async function searchWithFetcher(
  fetchPage: PageFetcher,
  filters: PropertyFilters,
  cursor: DocumentSnapshot | null = null,
  pageSize = PAGE_SIZE
): Promise<PropertyPage> {
  const collected: Property[] = [];
  let current = cursor;
  let exhausted = false;
  let lastDoc: DocumentSnapshot | null = cursor;
  const clientFiltered = needsClientFiltering(filters);
  const maxFetches = clientFiltered ? MAX_FETCHES_PER_PAGE : 1;

  for (let i = 0; i < maxFetches && collected.length < pageSize; i++) {
    const page = await fetchPage(current, pageSize);
    const parsed = page.docs.map((d) => normalizeProperty(d.id, d.data));
    const kept = clientFiltered ? applyClientFilters(parsed, filters) : parsed;

    // Never overshoot the page size: resume from the last row we actually used.
    for (let j = 0; j < kept.length && collected.length < pageSize; j++) {
      const row = kept[j]!;
      collected.push(row);
      const src = page.docs.find((d) => d.id === row.id);
      if (src) lastDoc = src.snapshot;
    }
    if (collected.length >= pageSize) {
      // There might be more after the last row we consumed.
      return { properties: collected, lastDoc, hasMore: true };
    }

    if (page.docs.length < pageSize) {
      exhausted = true;
      break;
    }
    const tail = page.docs[page.docs.length - 1];
    if (tail) {
      lastDoc = tail.snapshot;
      current = tail.snapshot;
    }
  }

  // Stopped early (fetch budget spent) or ran dry: more only exists if we did not exhaust the server pages.
  return { properties: collected, lastDoc, hasMore: !exhausted };
}

/**
 * Index-free fallback used when Firestore answers FAILED_PRECONDITION (a composite
 * index isn't deployed/built yet). It needs only the automatic single-field index
 * on `status`: fetch listed (approved + vacant) properties, then sort and filter in the app. An empty
 * marketplace therefore still renders the normal empty state instead of an error.
 * Not paginated (bounded to FALLBACK_LIMIT) — deploy the indexes for the full experience.
 */
const FALLBACK_LIMIT = 50;
async function fallbackApproved(): Promise<Property[]> {
  const snap = await getDocs(query(propertiesRef, where("status", "in", [...LISTED_STATUSES]), limit(FALLBACK_LIMIT)));
  return snap.docs
    .map((d) => normalizeProperty(d.id, d.data() as Record<string, unknown>))
    .sort(compareByCreatedAtDesc);
}

/**
 * MVP search directly against Firestore. Only status/city/type are sent to the
 * server (each combination has a composite index with createdAt); everything
 * else is filtered in-app. `searchProperties` is the single seam a dedicated
 * search service (Algolia/Typesense/Meilisearch) would replace later.
 */
export async function searchProperties(
  filters: PropertyFilters,
  cursor: DocumentSnapshot | null = null
): Promise<PropertyPage> {
  const fetchPage: PageFetcher = async (pageCursor, pageSize) => {
    const constraints: QueryConstraint[] = [where("status", "in", [...LISTED_STATUSES])];
    if (filters.city) constraints.push(where("location.city", "==", filters.city));
    if (filters.type) constraints.push(where("type", "==", filters.type));
    constraints.push(orderBy("createdAt", "desc"));
    if (pageCursor) constraints.push(startAfter(pageCursor));
    constraints.push(limit(pageSize));

    const snap = await getDocs(query(propertiesRef, ...constraints));
    return { docs: snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown>, snapshot: d })) };
  };
  try {
    return await searchWithFetcher(fetchPage, filters, cursor);
  } catch (error) {
    if (!isMissingIndexError(error) || cursor) throw error;
    logError("searchProperties: missing composite index, using fallback (deploy firestore.indexes.json)", error);
    const all = await fallbackApproved();
    const serverFilters = all.filter(
      (p) => (!filters.city || p.location.city === filters.city) && (!filters.type || p.type === filters.type)
    );
    return { properties: applyClientFilters(serverFilters, filters), lastDoc: null, hasMore: false };
  }
}

export async function getFeaturedProperties(city: string): Promise<Property[]> {
  try {
    const snap = await getDocs(
      query(
        propertiesRef,
        where("status", "in", [...LISTED_STATUSES]),
        where("location.city", "==", city),
        where("isVerified", "==", true),
        orderBy("createdAt", "desc"),
        limit(8)
      )
    );
    return snap.docs.map((d) => normalizeProperty(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    logError("getFeaturedProperties: missing composite index, using fallback", error);
    return (await fallbackApproved()).filter((p) => p.location.city === city && p.isVerified).slice(0, 8);
  }
}

export async function getNewListings(city: string): Promise<Property[]> {
  try {
    const snap = await getDocs(
      query(
        propertiesRef,
        where("status", "in", [...LISTED_STATUSES]),
        where("location.city", "==", city),
        orderBy("createdAt", "desc"),
        limit(10)
      )
    );
    return snap.docs.map((d) => normalizeProperty(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    logError("getNewListings: missing composite index, using fallback", error);
    return (await fallbackApproved()).filter((p) => p.location.city === city).slice(0, 10);
  }
}

/**
 * Returns null when the property doesn't exist OR when the caller isn't allowed
 * to read it (rules only expose approved listings to the public, so a listing
 * that was later suspended/rented is simply "not available" to a tenant).
 * Other failures (network, etc.) still throw so the UI can offer a retry.
 */
export async function getProperty(propertyId: string): Promise<Property | null> {
  try {
    const snap = await getDoc(doc(db, "properties", propertyId));
    if (!snap.exists()) return null;
    return normalizeProperty(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    if (getErrorCode(error).includes("permission-denied")) {
      logError("getProperty (not readable by this user)", error);
      return null;
    }
    throw error;
  }
}

export async function incrementPropertyViewCount(propertyId: string): Promise<void> {
  // Best-effort, fire-and-forget: a missed view count is not worth blocking
  // the UI or spending a retry budget on.
  try {
    await updateDoc(doc(db, "properties", propertyId), { viewCount: increment(1) });
  } catch {
    // ignore — view counts are non-critical
  }
}

export async function getPropertiesByLandlord(landlordId: string): Promise<Property[]> {
  const snap = await getDocs(
    query(propertiesRef, where("landlordId", "==", landlordId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => normalizeProperty(d.id, d.data() as Record<string, unknown>));
}

export type NewProperty = Omit<
  Property,
  "id" | "createdAt" | "updatedAt" | "viewCount" | "savedCount" | "isVerified" | "status"
>;

export async function createProperty(input: NewProperty): Promise<string> {
  const docRef = await addDoc(propertiesRef, {
    ...input,
    status: "pending" as PropertyStatus,
    isVerified: false,
    viewCount: 0,
    savedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProperty(
  propertyId: string,
  updates: Partial<Property>
): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function setPropertyStatus(
  propertyId: string,
  status: PropertyStatus
): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), { status, updatedAt: serverTimestamp() });
}
