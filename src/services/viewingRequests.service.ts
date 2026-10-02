import {
  collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/config/firebase";
import { isListedStatus } from "@/constants/propertyStatus";
import type { Property, ViewingRequest, ViewingRequestStatus } from "@/types";
import { createNotification } from "./notifications.service";
import { getProperty } from "./properties.service";
import { AppError, isMissingIndexError, logError } from "./errors";
import {
  buildViewingLockId,
  buildViewingRequestId,
  canMarkCompleted,
  canTransition,
  isActiveViewingStatus,
  isTerminalViewingStatus,
  validateViewingSlot,
  type ViewingActor,
} from "./viewingRequests.logic";

const viewingRequestsRef = collection(db, "viewingRequests");

const VIEWING_STATUSES = new Set<ViewingRequestStatus>(["pending", "accepted", "declined", "cancelled", "completed"]);

/** Defensive parse: old/partial documents must never crash the UI. */
export function normalizeViewingRequest(id: string, data: Record<string, unknown>): ViewingRequest {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id,
    propertyId: str(data.propertyId),
    tenantId: str(data.tenantId),
    landlordId: str(data.landlordId),
    requestedDate: str(data.requestedDate),
    requestedTime: str(data.requestedTime),
    message: typeof data.message === "string" && data.message.length > 0 ? data.message : undefined,
    propertyTitle: typeof data.propertyTitle === "string" ? data.propertyTitle : undefined,
    tenantName: typeof data.tenantName === "string" ? data.tenantName : undefined,
    status: VIEWING_STATUSES.has(data.status as ViewingRequestStatus) ? (data.status as ViewingRequestStatus) : "pending",
    createdAt: data.createdAt as ViewingRequest["createdAt"],
    updatedAt: data.updatedAt as ViewingRequest["updatedAt"],
  };
}

export interface SubmitViewingInput {
  propertyId: string;
  tenant: { id: string; firstName?: string; lastName?: string };
  requestedDate: string;
  requestedTime: string;
  message?: string;
}

/** Everything the submit flow touches, injectable so it can be tested without Firebase. */
export interface SubmitDeps {
  currentUid: () => string | null;
  getProperty: (id: string) => Promise<Property | null>;
  listTenantRequests: (tenantId: string) => Promise<ViewingRequest[]>;
  createRequest: (id: string, data: Record<string, unknown>) => Promise<void>;
  notify: (n: { userId: string; type: "new_viewing_request"; title: string; body: string; data: Record<string, string> }) => Promise<void>;
  now: () => Date;
}

const defaultSubmitDeps: SubmitDeps = {
  currentUid: () => auth.currentUser?.uid ?? null,
  getProperty,
  listTenantRequests: (tenantId) => getViewingRequestsForTenant(tenantId),
  createRequest: async (id, data) => {
    // The request and its lock are written atomically. firestore.rules require the lock
    // (one per tenant+property) so a modified client cannot open several requests.
    const batch = writeBatch(db);
    batch.set(doc(db, "viewingRequests", id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(doc(db, "viewingLocks", buildViewingLockId(String(data.tenantId), String(data.propertyId))), {
      tenantId: data.tenantId,
      landlordId: data.landlordId,
      propertyId: data.propertyId,
      requestId: id,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  },
  notify: (n) => createNotification(n),
  now: () => new Date(),
};

/**
 * Creates a viewing request.
 *
 * The landlord is derived from the PROPERTY document (never trusted from the
 * caller), the property must be approved, and every optional field that is
 * empty is omitted rather than sent as `undefined` (Firestore rejects
 * undefined). The document id is deterministic so double submissions can't
 * create duplicates. Notification delivery is best-effort: the request itself
 * succeeding is what the tenant cares about.
 */
export async function submitViewingRequestWith(deps: SubmitDeps, input: SubmitViewingInput): Promise<string> {
  const uid = deps.currentUid();
  if (!uid || uid !== input.tenant.id) {
    throw new AppError("Please sign in again to request a viewing.", "app/not-signed-in");
  }

  const slot = validateViewingSlot(
    { requestedDate: input.requestedDate, requestedTime: input.requestedTime, message: input.message },
    deps.now()
  );
  if (!slot.ok) throw new AppError(slot.reason, "app/invalid-slot");

  const property = await deps.getProperty(input.propertyId);
  if (!property || !isListedStatus(property.status) || !property.landlordId) {
    throw new AppError("This property is no longer available for viewings.", "app/property-unavailable");
  }
  if (property.landlordId === uid) {
    throw new AppError("You can't request a viewing of your own property.", "app/own-property");
  }

  // The read is only a friendly pre-check: the server-side lock is the authority. If the
  // list can't be read (e.g. an index is still building) we still try to submit.
  let existing: ViewingRequest[] = [];
  try {
    existing = await deps.listTenantRequests(uid);
  } catch (error) {
    logError("submitViewingRequest.precheck", error);
  }
  const active = existing.find((r) => r.propertyId === property.id && isActiveViewingStatus(r.status));
  if (active) {
    throw new AppError(
      "You already have an open viewing request for this property. You can cancel it from your Activity tab first.",
      "app/duplicate-request"
    );
  }

  // Re-requesting a slot whose earlier request was cancelled/declined needs a fresh id.
  let attempt = 1;
  while (existing.some((r) => r.id === buildViewingRequestId(uid, property.id, input.requestedDate, input.requestedTime, attempt))) {
    attempt += 1;
  }
  const id = buildViewingRequestId(uid, property.id, input.requestedDate, input.requestedTime, attempt);

  const tenantName = [input.tenant.firstName, input.tenant.lastName].filter(Boolean).join(" ").trim();
  const message = input.message?.trim();
  const payload: Record<string, unknown> = {
    propertyId: property.id,
    tenantId: uid,
    landlordId: property.landlordId,
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime,
    propertyTitle: property.title.slice(0, 120),
    status: "pending" as ViewingRequestStatus,
  };
  if (message) payload.message = message;
  if (tenantName) payload.tenantName = tenantName.slice(0, 80);

  await deps.createRequest(id, payload);

  try {
    await deps.notify({
      userId: property.landlordId,
      type: "new_viewing_request",
      title: "New viewing request",
      body: `${tenantName || "A tenant"} asked to view ${property.title.slice(0, 60)}.`,
      data: { viewingRequestId: id, propertyId: property.id },
    });
  } catch (error) {
    logError("submitViewingRequest.notify", error); // never fail the request over a notification
  }

  return id;
}

export function submitViewingRequest(input: SubmitViewingInput): Promise<string> {
  return submitViewingRequestWith(defaultSubmitDeps, input);
}

async function queryViewingRequests(field: "tenantId" | "landlordId", uid: string): Promise<ViewingRequest[]> {
  const toRequest = (d: { id: string; data: () => unknown }) =>
    normalizeViewingRequest(d.id, d.data() as Record<string, unknown>);
  try {
    const snap = await getDocs(query(viewingRequestsRef, where(field, "==", uid), orderBy("createdAt", "desc")));
    return snap.docs.map(toRequest);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    // Composite index not deployed/built yet: an equality-only query needs no composite
    // index, so read unordered and sort here.
    logError(`viewingRequests by ${field}: index missing, using fallback`, error);
    const snap = await getDocs(query(viewingRequestsRef, where(field, "==", uid)));
    return snap.docs.map(toRequest).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  }
}

function millis(value: unknown): number {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return value instanceof Date ? value.getTime() : 0;
}

export const getViewingRequestsForTenant = (tenantId: string) => queryViewingRequests("tenantId", tenantId);
export const getViewingRequestsForLandlord = (landlordId: string) => queryViewingRequests("landlordId", landlordId);

export interface TransitionDeps {
  updateStatus: (id: string, status: ViewingRequestStatus) => Promise<void>;
  notify: (n: { userId: string; type: "viewing_accepted" | "viewing_declined" | "viewing_cancelled" | "viewing_completed"; title: string; body: string; data: Record<string, string> }) => Promise<void>;
}

const defaultTransitionDeps: TransitionDeps = {
  updateStatus: async (id, status) => {
    const requestRef = doc(db, "viewingRequests", id);
    const batch = writeBatch(db);
    batch.update(requestRef, { status, updatedAt: serverTimestamp() });
    if (isTerminalViewingStatus(status)) {
      // Release the tenant+property lock in the same write so they can request again.
      const snap = await getDoc(requestRef);
      const data = snap.data() as { tenantId?: string; propertyId?: string } | undefined;
      if (data?.tenantId && data?.propertyId) {
        const lockRef = doc(db, "viewingLocks", buildViewingLockId(data.tenantId, data.propertyId));
        if ((await getDoc(lockRef)).exists()) batch.delete(lockRef);
      }
    }
    await batch.commit();
  },
  notify: (n) => createNotification(n),
};

const NOTIFICATION_COPY = {
  accepted: { type: "viewing_accepted", title: "Viewing accepted", body: "Your viewing request was accepted." },
  declined: { type: "viewing_declined", title: "Viewing declined", body: "Your viewing request was declined." },
  completed: { type: "viewing_completed", title: "Viewing completed", body: "Your viewing was marked as completed." },
  cancelled: { type: "viewing_cancelled", title: "Viewing cancelled", body: "A viewing was cancelled." },
} as const;

/**
 * Moves a request to a new status. Invalid transitions are rejected here AND
 * by firestore.rules, so a modified client can't skip states either.
 */
export async function transitionViewingRequestWith(
  deps: TransitionDeps,
  request: Pick<ViewingRequest, "id" | "status" | "tenantId" | "landlordId"> &
    Partial<Pick<ViewingRequest, "requestedDate" | "requestedTime">>,
  to: ViewingRequestStatus,
  actor: ViewingActor,
  now: Date = new Date()
): Promise<void> {
  if (!canTransition(actor, request.status, to)) {
    throw new AppError("That viewing request can't be changed to that status anymore.", "app/invalid-transition");
  }
  if (to === "completed" && request.requestedDate && request.requestedTime && !canMarkCompleted(request.requestedDate, request.requestedTime, now)) {
    throw new AppError("You can mark a viewing as completed once its scheduled time has arrived.", "app/too-early");
  }
  await deps.updateStatus(request.id, to);

  if (to === "pending") return;
  const copy = NOTIFICATION_COPY[to];
  try {
    await deps.notify({
      userId: actor === "tenant" ? request.landlordId : request.tenantId,
      type: copy.type,
      title: copy.title,
      body:
        to === "cancelled"
          ? actor === "tenant"
            ? "A tenant cancelled their viewing."
            : "The landlord cancelled your viewing."
          : copy.body,
      data: { viewingRequestId: request.id },
    });
  } catch (error) {
    logError("transitionViewingRequest.notify", error);
  }
}

export function transitionViewingRequest(
  request: Pick<ViewingRequest, "id" | "status" | "tenantId" | "landlordId"> &
    Partial<Pick<ViewingRequest, "requestedDate" | "requestedTime">>,
  to: ViewingRequestStatus,
  actor: ViewingActor
): Promise<void> {
  return transitionViewingRequestWith(defaultTransitionDeps, request, to, actor);
}

export const cancelViewingRequest = (r: Pick<ViewingRequest, "id" | "status" | "tenantId" | "landlordId">) =>
  transitionViewingRequest(r, "cancelled", "tenant");
