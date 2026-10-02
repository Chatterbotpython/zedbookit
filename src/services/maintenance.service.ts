import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type {
  AssigneeType,
  MaintenanceCategory,
  MaintenanceMessage,
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenanceTimelineEvent,
  MaintenanceUrgency,
  UserRole,
} from "@/types";
import { formatReferenceNumber } from "@/utils/referenceNumber";
import { createNotification } from "./notifications.service";

const maintenanceRef = collection(db, "maintenanceRequests");

/**
 * Reference numbers (ZB-2026-00482) come from an atomic Firestore transaction
 * against `counters/maintenance_{year}` so two simultaneous submissions can
 * never collide, without needing a Cloud Function for the MVP.
 */
async function nextReferenceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `maintenance_${year}`);
  const sequence = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return formatReferenceNumber(year, sequence);
}

async function addTimelineEvent(
  maintenanceRequestId: string,
  status: MaintenanceStatus,
  actorId: string,
  note?: string
): Promise<void> {
  await addDoc(collection(db, "maintenanceRequests", maintenanceRequestId, "timeline"), {
    maintenanceRequestId,
    status,
    actorId,
    note: note ?? null,
    createdAt: serverTimestamp(),
  });
}

export interface NewMaintenanceRequest {
  propertyId: string;
  tenancyId: string;
  tenantId: string;
  landlordId: string;
  category: MaintenanceCategory;
  title: string;
  description: string;
  urgency: MaintenanceUrgency;
  photos: string[];
  videoUrl?: string;
  preferredAccessTime?: string;
}

/**
 * Creates a maintenance request. Firestore security rules independently
 * enforce that `tenancyId` must reference a tenancy the caller owns and that
 * is `active` (see firestore.rules) — this check here is only for a fast,
 * friendly client-side error before we even attempt the write.
 */
export async function submitMaintenanceRequest(
  input: NewMaintenanceRequest
): Promise<{ id: string; referenceNumber: string }> {
  const referenceNumber = await nextReferenceNumber();

  const docRef = await addDoc(maintenanceRef, {
    ...input,
    referenceNumber,
    status: "submitted" as MaintenanceStatus,
    costVisibleToTenant: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(docRef.id, "submitted", input.tenantId);

  try {
    await createNotification({
      userId: input.landlordId,
      type: "new_maintenance_request",
      title: "New maintenance request",
      body: `${input.title} (${referenceNumber})`,
      data: { maintenanceRequestId: docRef.id },
    });
  } catch {
    // Notifications are secondary; do not turn a successful maintenance
    // submission into a user-facing failure if notification delivery fails.
  }

  return { id: docRef.id, referenceNumber };
}

export async function getMaintenanceRequest(id: string): Promise<MaintenanceRequest | null> {
  const snap = await getDoc(doc(db, "maintenanceRequests", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MaintenanceRequest;
}

export async function getMaintenanceRequestsForTenant(
  tenantId: string
): Promise<MaintenanceRequest[]> {
  const snap = await getDocs(
    query(maintenanceRef, where("tenantId", "==", tenantId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceRequest);
}

export async function getMaintenanceRequestsForLandlord(
  landlordId: string
): Promise<MaintenanceRequest[]> {
  const snap = await getDocs(
    query(maintenanceRef, where("landlordId", "==", landlordId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceRequest);
}

export async function getMaintenanceHistoryForProperty(
  propertyId: string,
  viewer: { id: string; role: UserRole }
): Promise<{
  requests: MaintenanceRequest[];
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  cancelledCount: number;
  totalCost: number;
}> {
  const ownershipField = viewer.role === "tenant" ? "tenantId" : "landlordId";
  const snap = await getDocs(
    query(
      maintenanceRef,
      where("propertyId", "==", propertyId),
      where(ownershipField, "==", viewer.id),
      orderBy("createdAt", "desc")
    )
  );
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceRequest);
  return {
    requests,
    totalCount: requests.length,
    completedCount: requests.filter((r) => r.status === "completed").length,
    inProgressCount: requests.filter(
      (r) => r.status === "in_progress" || r.status === "scheduled" || r.status === "assigned"
    ).length,
    cancelledCount: requests.filter((r) => r.status === "cancelled").length,
    totalCost: requests.reduce((sum, r) => sum + (r.actualCost ?? 0), 0),
  };
}

/** Realtime listener — maintenance status is one of the few places the spec
 * calls out for live updates, so tenants see progress without refreshing. */
export function subscribeToMaintenanceRequest(
  id: string,
  callback: (request: MaintenanceRequest | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, "maintenanceRequests", id), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as MaintenanceRequest) : null);
  });
}

export function subscribeToTimeline(
  maintenanceRequestId: string,
  callback: (events: MaintenanceTimelineEvent[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "maintenanceRequests", maintenanceRequestId, "timeline"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceTimelineEvent));
  });
}

const STATUS_NOTIFICATION_COPY: Partial<
  Record<MaintenanceStatus, { type: import("@/types").NotificationType; title: string }>
> = {
  assigned: { type: "technician_assigned", title: "Technician assigned" },
  scheduled: { type: "maintenance_scheduled", title: "Maintenance scheduled" },
  completed: { type: "maintenance_completed", title: "Maintenance completed" },
};

export async function updateMaintenanceStatus(
  request: Pick<MaintenanceRequest, "id" | "referenceNumber" | "tenantId">,
  status: MaintenanceStatus,
  actorId: string,
  note?: string
): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", request.id), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === "completed" ? { completedAt: serverTimestamp() } : {}),
  });
  await addTimelineEvent(request.id, status, actorId, note);

  const copy = STATUS_NOTIFICATION_COPY[status];
  if (copy) {
    await createNotification({
      userId: request.tenantId,
      type: copy.type,
      title: copy.title,
      body: `${copy.title} — ${request.referenceNumber}`,
      data: { maintenanceRequestId: request.id },
    });
  } else {
    await createNotification({
      userId: request.tenantId,
      type: "maintenance_updated",
      title: "Maintenance update",
      body: `Your request ${request.referenceNumber} was updated.`,
      data: { maintenanceRequestId: request.id },
    });
  }
}

export async function assignMaintenance(
  request: Pick<MaintenanceRequest, "id" | "referenceNumber" | "tenantId">,
  assignment: { assignedTo: string; assigneeType: AssigneeType; assignedBy: string; contactPhone?: string }
): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", request.id), {
    status: "assigned" as MaintenanceStatus,
    assignment: {
      ...assignment,
      assignedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  // Append-only audit trail, matches the `maintenanceAssignments` collection
  // in the architecture doc; the current assignment is denormalized onto the
  // request itself (above) so screens don't need a second read.
  await addDoc(collection(db, "maintenanceAssignments"), {
    maintenanceRequestId: request.id,
    ...assignment,
    assignedAt: serverTimestamp(),
  });

  await addTimelineEvent(request.id, "assigned", assignment.assignedBy);

  await createNotification({
    userId: request.tenantId,
    type: "technician_assigned",
    title: "Technician assigned",
    body: `${assignment.assignedTo} has been assigned to ${request.referenceNumber}.`,
    data: { maintenanceRequestId: request.id },
  });
}

export async function scheduleMaintenance(
  request: Pick<MaintenanceRequest, "id" | "referenceNumber" | "tenantId">,
  scheduledAt: Date,
  actorId: string
): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", request.id), {
    status: "scheduled" as MaintenanceStatus,
    scheduledAt,
    updatedAt: serverTimestamp(),
  });
  await addTimelineEvent(request.id, "scheduled", actorId);
  await createNotification({
    userId: request.tenantId,
    type: "maintenance_scheduled",
    title: "Maintenance scheduled",
    body: `${request.referenceNumber} has been scheduled.`,
    data: { maintenanceRequestId: request.id },
  });
}

export async function setMaintenanceCost(
  maintenanceRequestId: string,
  cost: { estimatedCost?: number; actualCost?: number; costVisibleToTenant?: boolean; invoiceReference?: string }
): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", maintenanceRequestId), {
    ...cost,
    currency: "ZMW",
    updatedAt: serverTimestamp(),
  });
}

// ---- Maintenance conversation (kept fully separate from property enquiry chats) ----

export async function sendMaintenanceMessage(
  maintenanceRequestId: string,
  senderId: string,
  senderRole: UserRole,
  text: string
): Promise<void> {
  await addDoc(collection(db, "maintenanceMessages"), {
    maintenanceRequestId,
    senderId,
    senderRole,
    text,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToMaintenanceMessages(
  maintenanceRequestId: string,
  callback: (messages: MaintenanceMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "maintenanceMessages"),
    where("maintenanceRequestId", "==", maintenanceRequestId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceMessage));
  });
}
