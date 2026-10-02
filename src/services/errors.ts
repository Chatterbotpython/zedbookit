/**
 * Centralised error handling.
 *
 * Rules:
 *  1. Screens NEVER show raw Firebase messages/codes to users. They call
 *     `toUserMessage(error, context)` and show the (human-readable) result.
 *  2. Technical detail is logged (once, via `logError`) so developers can still
 *     diagnose problems from device logs / Metro / crash reporting.
 *  3. Empty results are NOT errors. Services return `[]`; only genuine failures
 *     throw, and those are mapped here.
 */

export type ErrorContext =
  | "auth"
  | "register"
  | "properties"
  | "property"
  | "viewing"
  | "favorites"
  | "maintenance"
  | "messaging"
  | "notifications"
  | "profile"
  | "admin"
  | "generic";

/** Error carrying a message that is already safe/friendly to show. */
export class AppError extends Error {
  friendlyMessage: string;
  code: string;
  constructor(friendlyMessage: string, code = "app/error", cause?: unknown) {
    super(friendlyMessage);
    this.name = "AppError";
    this.friendlyMessage = friendlyMessage;
    this.code = code;
    this.cause = cause;
  }
}

export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : "";
}

/** Strips a "firestore/" or "auth/" style prefix so both SDK flavours match. */
function shortCode(error: unknown): string {
  const code = getErrorCode(error);
  const slash = code.indexOf("/");
  return slash >= 0 ? code.slice(slash + 1) : code;
}

export function isNetworkError(error: unknown): boolean {
  const code = shortCode(error);
  if (
    code === "network-request-failed" ||
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "cancelled"
  ) {
    return true;
  }
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && /network request failed|failed to fetch|offline/i.test(message);
}

/** True when Firestore rejected a query because a composite index is missing/still building. */
export function isMissingIndexError(error: unknown): boolean {
  return shortCode(error) === "failed-precondition";
}

export function isPermissionError(error: unknown): boolean {
  const code = shortCode(error);
  return code === "permission-denied" || code === "unauthenticated";
}

export const NETWORK_MESSAGE = "Unable to connect. Please check your internet connection.";

const DEFAULT_BY_CONTEXT: Record<ErrorContext, string> = {
  auth: "We couldn't sign you in. Please try again.",
  register: "We couldn't create your account. Please try again.",
  properties: "We couldn't load properties right now. Please try again.",
  property: "We couldn't load this property. Please try again.",
  viewing: "We couldn't send your viewing request. Please try again.",
  favorites: "We couldn't update your saved homes. Please try again.",
  maintenance: "We couldn't complete that maintenance action. Please try again.",
  messaging: "We couldn't send your message. Please try again.",
  notifications: "We couldn't load your notifications. Please try again.",
  profile: "We couldn't update your profile. Please try again.",
  admin: "We couldn't complete that admin action. Please try again.",
  generic: "Something went wrong. Please try again.",
};

/** Auth-specific mapping (Firebase Auth error codes). */
function authMessage(code: string): string | null {
  switch (code) {
    case "invalid-credential":
    case "invalid-login-credentials":
    case "wrong-password":
    case "user-not-found":
      return "Email or password is incorrect.";
    case "invalid-email":
      return "That email address doesn't look right.";
    case "email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "weak-password":
      return "Please use a password with at least 8 characters.";
    case "user-disabled":
      return "This account has been disabled. Please contact support.";
    case "too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "requires-recent-login":
      return "Please sign in again to continue.";
    default:
      return null;
  }
}

export function toUserMessage(error: unknown, context: ErrorContext = "generic"): string {
  if (error instanceof AppError) return error.friendlyMessage;

  if (isNetworkError(error)) return NETWORK_MESSAGE;

  const code = shortCode(error);

  if (context === "auth" || context === "register") {
    const m = authMessage(code);
    if (m) return m;
  }

  switch (code) {
    case "permission-denied":
      return context === "viewing"
        ? "You can't request a viewing for this property right now."
        : "You don't have permission to do that.";
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    case "failed-precondition":
      // Almost always a Firestore composite index that isn't deployed/built yet.
      return "This section is still being set up. Please try again in a few minutes.";
    case "resource-exhausted":
      return "We're a bit busy right now. Please try again in a moment.";
    case "not-found":
      return "We couldn't find that. It may have been removed.";
    case "already-exists":
      return context === "viewing"
        ? "You've already requested a viewing for that date and time. Please pick another slot."
        : "That already exists.";
    case "aborted":
      return "That took too long or was interrupted. Please try again.";
    default:
      return DEFAULT_BY_CONTEXT[context];
  }
}

/**
 * Logs technical detail for developers. Never shown to users. Includes the
 * Firestore console index link (present in failed-precondition messages) so a
 * missing index can be created in one click.
 */
export function logError(where: string, error: unknown): void {
  const code = getErrorCode(error) || "unknown";
  const message = (error as { message?: unknown } | null | undefined)?.message;
  // eslint-disable-next-line no-console
  console.warn(`[ZedBookIt] ${where} failed (${code})`, typeof message === "string" ? message : error);
}

/** Back-compat helper used by older screens. */
export function friendlyFirestoreError(error: unknown, context: ErrorContext = "generic"): string {
  return toUserMessage(error, context);
}
