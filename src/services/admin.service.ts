import { collection, doc, getCountFromServer, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { LISTED_STATUSES } from "@/constants/propertyStatus";
import { db } from "@/config/firebase";
import type { Property, Report, UserProfile } from "@/types";

/**
 * Uses Firestore's `getCountFromServer` aggregation query wherever possible —
 * it's billed as a single small read regardless of collection size, which is
 * exactly the "minimize reads" principle the architecture calls for; the
 * alternative (fetching every document just to call `.length`) would not
 * scale and would burn through the free tier fast.
 */
export async function getPlatformStats() {
  const usersRef = collection(db, "users");
  const propertiesRef = collection(db, "properties");
  const maintenanceRef = collection(db, "maintenanceRequests");
  const viewingRequestsRef = collection(db, "viewingRequests");

  const [
    totalUsers,
    activeTenants,
    activeLandlords,
    activeProperties,
    pendingApprovals,
    openMaintenance,
    completedMaintenance,
    viewingRequestsCount,
  ] = await Promise.all([
    getCountFromServer(usersRef),
    getCountFromServer(query(usersRef, where("role", "==", "tenant"))),
    getCountFromServer(query(usersRef, where("role", "in", ["landlord", "agent"]))),
    getCountFromServer(query(propertiesRef, where("status", "in", [...LISTED_STATUSES]))),
    getCountFromServer(query(propertiesRef, where("status", "==", "pending"))),
    getCountFromServer(
      query(maintenanceRef, where("status", "not-in", ["completed", "cancelled"]))
    ),
    getCountFromServer(query(maintenanceRef, where("status", "==", "completed"))),
    getCountFromServer(viewingRequestsRef),
  ]);

  return {
    totalUsers: totalUsers.data().count,
    activeTenants: activeTenants.data().count,
    activeLandlords: activeLandlords.data().count,
    activeProperties: activeProperties.data().count,
    pendingApprovals: pendingApprovals.data().count,
    openMaintenance: openMaintenance.data().count,
    completedMaintenance: completedMaintenance.data().count,
    viewingRequests: viewingRequestsCount.data().count,
  };
}

export async function getPendingProperties(): Promise<Property[]> {
  return listPropertiesByStatus("pending");
}

/**
 * Backs the admin Properties screen's status tabs. Every status shares the
 * same (status ASC, createdAt DESC) composite index, so this one query shape
 * covers pending/approved/rejected/suspended without adding a new index per
 * tab.
 */
export async function listPropertiesByStatus(status: Property["status"]): Promise<Property[]> {
  const snap = await getDocs(
    query(collection(db, "properties"), where("status", "==", status), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property);
}

export async function approveProperty(propertyId: string): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), { status: "approved", isVerified: true });
}

export async function rejectProperty(propertyId: string): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), { status: "rejected" });
}

export async function suspendProperty(propertyId: string): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), { status: "suspended" });
}

/** Restores a suspended or rejected listing to public visibility. Verification
 * is left as-is (already-verified listings stay verified; others don't gain
 * verification just from reactivation). */
export async function reactivateProperty(propertyId: string): Promise<void> {
  await updateDoc(doc(db, "properties", propertyId), { status: "approved" });
}

export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile);
}

/** Only an admin can call this per `firestore.rules` — the client-side role
 * check here is just for a fast UI affordance. */
export async function setUserSuspended(userId: string, isSuspended: boolean): Promise<void> {
  await updateDoc(doc(db, "users", userId), { isSuspended });
}

export async function listReports(): Promise<Report[]> {
  const snap = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
}

export async function resolveReport(reportId: string, status: Report["status"]): Promise<void> {
  await updateDoc(doc(db, "reports", reportId), { status });
}
