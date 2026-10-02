import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, Unsubscribe, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Conversation, Message } from "@/types";
import { AppError } from "./errors";
import { TENANT_NAME_MAX_LENGTH } from "@/utils/conversation";

const conversationsRef = collection(db, "conversations");

/**
 * Property-enquiry conversations use a deterministic id so re-opening a chat
 * with the same landlord about the same property never creates a duplicate
 * thread.
 */
function propertyConversationId(propertyId: string, tenantId: string, landlordId: string) {
  return `enquiry_${propertyId}_${tenantId}_${landlordId}`;
}

/** Conversation ids are deterministic, so callers can navigate straight to
 * `conversation/{id}` without a network round trip just to look one up. */
export function getPropertyConversationId(
  propertyId: string,
  tenantId: string,
  landlordId: string
): string {
  return propertyConversationId(propertyId, tenantId, landlordId);
}

/**
 * Enquiry conversation ids are `enquiry_{propertyId}_{tenantId}_{landlordId}`.
 * Firestore auto-ids and Firebase uids contain no underscores, so the parts can
 * be recovered from the id (used when a landlord opens a thread and needs the
 * tenant's id to reply into the SAME conversation).
 */
export function parseEnquiryConversationId(
  conversationId: string
): { propertyId: string; tenantId: string; landlordId: string } | null {
  const parts = conversationId.split("_");
  if (parts.length !== 4 || parts[0] !== "enquiry" || parts.some((p) => !p)) return null;
  return { propertyId: parts[1]!, tenantId: parts[2]!, landlordId: parts[3]! };
}

export const MESSAGE_MAX_LENGTH = 2000;

// sendPropertyMessage creates-or-updates the parent conversation doc (via
// setDoc merge) on every send, so there's no separate "ensure conversation
// exists" round trip before a tenant can message a landlord.
/**
 * Fields written to the conversation document (timestamps are added by the caller).
 * `tenantName` is included ONLY when the tenant is the sender, so a landlord's reply can
 * never overwrite it, and nothing but the display name is stored (no email/phone).
 */
export function buildConversationFields(args: {
  propertyId: string;
  tenantId: string;
  landlordId: string;
  senderId: string;
  lastMessage: string;
  senderName?: string;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    context: "property_enquiry",
    propertyId: args.propertyId,
    participantIds: [args.tenantId, args.landlordId],
    lastMessage: args.lastMessage.slice(0, 200),
  };
  const name = args.senderName?.replace(/\s+/g, " ").trim().slice(0, TENANT_NAME_MAX_LENGTH);
  if (args.senderId === args.tenantId && name) fields.tenantName = name;
  return fields;
}

/** One-shot read of a conversation the caller participates in (null if missing / not allowed). */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  try {
    const snap = await getDoc(doc(db, "conversations", conversationId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Conversation) : null;
  } catch {
    return null;
  }
}

export async function sendPropertyMessage(
  propertyId: string,
  tenantId: string,
  landlordId: string,
  senderId: string,
  text: string,
  senderName?: string
): Promise<void> {
  const clean = text.trim();
  if (!clean) throw new AppError("Type a message first.", "app/empty-message");
  if (clean.length > MESSAGE_MAX_LENGTH) {
    throw new AppError(`Please keep messages under ${MESSAGE_MAX_LENGTH} characters.`, "app/message-too-long");
  }
  if (senderId !== tenantId && senderId !== landlordId) {
    throw new AppError("You can't send messages in this conversation.", "app/not-participant");
  }
  const conversationId = propertyConversationId(propertyId, tenantId, landlordId);
  await setDoc(
    doc(db, "conversations", conversationId),
    {
      ...buildConversationFields({ propertyId, tenantId, landlordId, senderId, lastMessage: clean, senderName }),
      lastMessageAt: serverTimestamp(),
    },
    { merge: true }
  );
  await addDoc(collection(db, "messages"), {
    conversationId,
    senderId,
    text: clean,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });
}

export function subscribeToConversations(
  userId: string,
  callback: (conversations: Conversation[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    conversationsRef,
    where("participantIds", "array-contains", userId),
    orderBy("lastMessageAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation));
    },
    (error) => onError?.(error)
  );
}

export function subscribeToMessages(
  conversationId: string,
  callback: (messages: Message[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message));
    },
    (error) => onError?.(error)
  );
}
