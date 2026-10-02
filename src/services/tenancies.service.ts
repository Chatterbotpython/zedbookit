import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Tenancy, TenancyStatus } from "@/types";

const tenanciesRef = collection(db, "tenancies");

/** A tenant's single active tenancy, if any — this is what decides whether
 * the tenant app shows "Find a Home" or "My Home" as the primary surface. */
export async function getActiveTenancyForTenant(tenantId: string): Promise<Tenancy | null> {
  const snap = await getDocs(
    query(
      tenanciesRef,
      where("tenantId", "==", tenantId),
      where("status", "==", "active"),
      limit(1)
    )
  );
  const d = snap.docs[0];
  if (!d) return null;
  return { id: d.id, ...d.data() } as Tenancy;
}

export async function getTenancy(tenancyId: string): Promise<Tenancy | null> {
  const snap = await getDoc(doc(db, "tenancies", tenancyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Tenancy;
}

export async function getTenanciesForLandlord(landlordId: string): Promise<Tenancy[]> {
  const snap = await getDocs(
    query(tenanciesRef, where("landlordId", "==", landlordId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tenancy);
}

export async function createTenancy(input: {
  tenantId: string;
  propertyId: string;
  landlordId: string;
  startDate: Date;
  status?: TenancyStatus;
}): Promise<string> {
  const docRef = await addDoc(tenanciesRef, {
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    landlordId: input.landlordId,
    startDate: input.startDate,
    status: input.status ?? "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function endTenancy(tenancyId: string): Promise<void> {
  await updateDoc(doc(db, "tenancies", tenancyId), {
    status: "ended" as TenancyStatus,
    endDate: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
