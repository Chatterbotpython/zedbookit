import { describe, expect, it } from "vitest";
import { AppError, isMissingIndexError, toUserMessage } from "@/services/errors";

const fb = (code: string, message = "Firebase: raw internal text (secret-project)") => Object.assign(new Error(message), { code });

describe("error mapping", () => {
  it("maps bad credentials to a friendly message, never the raw text", () => {
    for (const c of ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"]) {
      expect(toUserMessage(fb(c), "auth")).toBe("Email or password is incorrect.");
    }
  });
  it("maps network failures", () => {
    expect(toUserMessage(fb("auth/network-request-failed"), "auth")).toBe("Unable to connect. Please check your internet connection.");
    expect(toUserMessage(fb("unavailable"), "properties")).toBe("Unable to connect. Please check your internet connection.");
  });
  it("viewing failure copy", () => {
    expect(toUserMessage(new Error("boom"), "viewing")).toBe("We couldn't send your viewing request. Please try again.");
  });
  it("failed-precondition is friendly and detectable", () => {
    const e = fb("failed-precondition", "The query requires an index. You can create it here: https://console.firebase.google.com/...");
    expect(isMissingIndexError(e)).toBe(true);
    expect(toUserMessage(e, "properties")).not.toMatch(/index|precondition|firebase/i);
  });
  it("never leaks raw Firebase text", () => {
    for (const code of ["permission-denied", "not-found", "aborted", "weird-code", "resource-exhausted"]) {
      expect(toUserMessage(fb(code), "generic")).not.toMatch(/firebase|secret-project|raw internal/i);
    }
  });
  it("AppError messages pass through", () => {
    expect(toUserMessage(new AppError("Pick another date."), "viewing")).toBe("Pick another date.");
  });
});
