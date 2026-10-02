import type { Conversation } from "@/types";

export const TENANT_NAME_MAX_LENGTH = 80;

/** Tenant display name for a conversation: first + last name only (never email/phone). */
export function buildTenantDisplayName(profile: { firstName?: string; lastName?: string }): string {
  return `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.replace(/\s+/g, " ").trim().slice(0, TENANT_NAME_MAX_LENGTH);
}

/**
 * Title shown for a conversation.
 *  - landlord/agent viewing a property enquiry: the tenant's name, with a safe fallback for
 *    conversations created before names were stored.
 *  - everyone else keeps the generic wording.
 */
export function conversationTitle(
  conversation: Pick<Conversation, "context" | "tenantName">,
  viewerRole: string | null | undefined
): string {
  if (conversation.context === "maintenance") return "Maintenance conversation";
  if (viewerRole === "landlord" || viewerRole === "agent" || viewerRole === "admin") {
    const name = conversation.tenantName?.trim();
    return name ? name : "Tenant enquiry";
  }
  return "Property enquiry";
}
